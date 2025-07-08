const express = require('express');
const { safeApiCall, formatNumber, formatReach } = require('../utils/helpers');
const router = express.Router();

const igBusinessAccountId = process.env.IGBUSSINESS_ID;
const accessToken = process.env.ACCESS_TOKEN_SECRET;

router.get("/:username", async (req, res) => {
  const username = req.params.username;
  const TARGET = 12;
  let reels = [], cursor = null;

  try {
    const fields = `business_discovery.username(${username}){followers_count,media_count,media.limit(30){comments_count,like_count,view_count,media_product_type}}`;
    let url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${fields}&access_token=${accessToken}`;

    const response = await safeApiCall(url);
    const data = response.data.business_discovery;

    const followers = data.followers_count;
    const mediaCount = data.media_count;
    const items = data.media?.data || [];
    reels = items.filter(i => i.media_product_type === "REELS").slice(0, TARGET);

    const totalLikes = reels.reduce((sum, r) => sum + (r.like_count || 0), 0);
    const totalComments = reels.reduce((sum, r) => sum + (r.comments_count || 0), 0);
    const totalViews = reels.reduce((sum, r) => sum + (r.view_count || 0), 0);

    const avgLikes = Math.round(totalLikes / reels.length);
    const avgComments = Math.round(totalComments / reels.length);
    const avgReach = formatReach(totalViews / reels.length);
    const engagement = ((totalLikes + totalComments) / (followers * reels.length) * 100).toFixed(2);

    res.render("Reach/profile", {
      username,
      followers: formatNumber(followers),
      mediaCount,
      avgLikes,
      avgComments,
      avgReach,
      engagement
    });

  } catch (err) {
    console.error(err.message);
    res.render("Reach/error", { message: "Error fetching data" });
  }
});

module.exports = router;
