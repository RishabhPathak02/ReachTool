const express = require('express');
const { safeApiCall, formatNumber, formatReach } = require('../utils/helpers');

const router = express.Router();

const igBusinessAccountId = process.env.IGBUSSINESS_ID;
const accessToken = process.env.ACCESS_TOKEN_SECRET;

if (!igBusinessAccountId || !accessToken) {
  throw new Error('Missing Instagram API credentials in environment variables.');
}

router.get('/:username', async (req, res) => {
  const { username } = req.params;
  const TARGET = 12;

  try {
    const baseFields = `business_discovery.username(${username}){followers_count,media_count}`;
    const baseUrl = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${baseFields}&access_token=${accessToken}`;

    const baseResponse = await safeApiCall(baseUrl);
    const baseData = baseResponse?.data?.business_discovery;

    if (!baseData) throw new Error('No data returned from API');

    const { followers_count = 0, media_count = 0 } = baseData;

    let reels = [];
    let after = null;

    while (reels.length < TARGET) {
      const mediaFields = `business_discovery.username(${username}){media.limit(30)${after ? `.after(${after})` : ''}{comments_count,like_count,view_count,media_product_type}}`;
      const mediaUrl = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${mediaFields}&access_token=${accessToken}`;

      const mediaResponse = await safeApiCall(mediaUrl);
      const mediaItems = mediaResponse?.data?.business_discovery?.media?.data || [];

      reels = reels.concat(mediaItems.filter(item => item.media_product_type === 'REELS'));

      const paging = mediaResponse?.data?.business_discovery?.media?.paging?.cursors;
      if (!paging?.after) break;

      after = paging.after;
    }

    reels = reels.slice(0, TARGET);

    if (reels.length === 0) {
      return res.render('Reach/error', { message: 'No reels found for this account.' });
    }

    const totalLikes = reels.reduce((sum, reel) => sum + (reel.like_count || 0), 0);
    const totalComments = reels.reduce((sum, reel) => sum + (reel.comments_count || 0), 0);
    const totalViews = reels.reduce((sum, reel) => sum + (reel.view_count || 0), 0);
    const cnt = reels.length ;
    const avgLikes = cnt ? Math.round(totalLikes / cnt) : 0 ;
    const avgComments = cnt ? Math.round(totalComments / cnt) : 0 ;
    const avgReach = cnt ? formatReach(totalViews / cnt ) : '0';
    const engagement = followers_count > 0 ? ((totalLikes + totalComments) / (followers_count * cnt) * 100).toFixed(2) +'%': '0.00%';
//log for debugging
    console.log(`Processed ${reels.length} reels for user: ${username}`);
    console.log(`Followers: ${followers_count}, Media Count: ${media_count}`);
    console.log(`Avg Likes: ${avgLikes}, Avg Comments: ${avgComments}, Avg Reach: ${avgReach}, Engagement Rate: ${engagement}%`);
    console.log(`Total Likes: ${totalLikes}, Total Comments: ${totalComments}, Total Views: ${totalViews}`);
    console.log(`Reels Data: ${JSON.stringify(reels, null, 2)}`);

    res.render('Reach/profile', {
      username,
      followers: formatNumber(followers_count),
      mediaCount: media_count,
      avgLikes,
      avgComments,
      avgReach,
      engagement
    });

  } catch (err) {
    console.error('Error fetching Instagram data:', err.message);

    const apiError = err.response?.data?.error?.message || 'Unknown error occurred. Please try again later.';
    res.render('Reach/error', { message: apiError });
  }
});

module.exports = router;
