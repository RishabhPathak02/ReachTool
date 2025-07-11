const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { extractUsername, safeApiCall, formatNumber, formatReach } = require('../utils/helpers');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
const OUTPUT_DIR = path.resolve(__dirname, '../outputs');

module.exports = (io) => {
  router.get('/', (req, res) => {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.csv'));
    if (!files.length) return res.status(400).send('❌ No CSV uploaded.');

    const inputFile = path.join(UPLOAD_DIR, files[0]);
    const outputFile = path.join(OUTPUT_DIR, 'instagram_report.csv');

    const igBusinessAccountId = process.env.IGBUSSINESS_ID;
    const accessToken = process.env.ACCESS_TOKEN_SECRET;

    const results = [];

    const nameRegex = /(name|full\s*real\s*name)/i;
    const usernameRegex = /(username|profile|link|instagram|insta|url)/i;

    fs.createReadStream(inputFile)
      .pipe(csv())
      .on('data', row => {
        const cleanedRow = {};
        Object.keys(row).forEach(key => {
          cleanedRow[key.trim()] = row[key];
        });

        let name = '';
        let usernameField = '';

        for (const [key, value] of Object.entries(cleanedRow)) {
          const lowerKey = key.trim().toLowerCase();

          if (!name && nameRegex.test(lowerKey)) {
            name = value;
          }

          if (!usernameField && usernameRegex.test(lowerKey)) {
            usernameField = value;
          }
        }

        const username = extractUsername(usernameField);

        results.push({
          Name: name || '',
          Username: username || ''
        });
      })
      .on('end', async () => {
        const usernames = results.map(r => r.Username).filter(Boolean);

        const rows = [];
        let quotaExceeded = false;

        for (let count = 0; count < usernames.length; count++) {
          const username = usernames[count];

          let reels = [], followers = 0, mediaCount = 0;

          if (!quotaExceeded) {
            try {
              const fields = `business_discovery.username(${username}){followers_count,media_count}`;
              const baseUrl = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${fields}&access_token=${accessToken}`;

              const baseResp = await safeApiCall(baseUrl);
              const baseData = baseResp?.data?.business_discovery;

              if (baseData) {
                followers = baseData.followers_count || 0;
                mediaCount = baseData.media_count || 0;

                let after = null;
                while (reels.length < 12) {
                  const mediaFields = `business_discovery.username(${username}){media.limit(30)${after ? `.after(${after})` : ''}{comments_count,like_count,view_count,media_product_type}}`;
                  const mediaUrl = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${mediaFields}&access_token=${accessToken}`;

                  const mediaResp = await safeApiCall(mediaUrl);
                  const mediaData = mediaResp?.data?.business_discovery?.media?.data || [];

                  reels = reels.concat(mediaData.filter(i => i.media_product_type === 'REELS'));

                  const paging = mediaResp?.data?.business_discovery?.media?.paging?.cursors;
                  if (!paging?.after) break;
                  after = paging.after;
                }

                reels = reels.slice(0, 12);
              }
            } catch (err) {
              const msg = err?.response?.data?.error?.message?.toLowerCase() || '';
              if (msg.includes('limit') || err.response?.status === 403) {
                quotaExceeded = true;
              }
            }
          }

          let rowData = {};

          if (quotaExceeded) {
            rowData = {
              Username: username,
              followers: 'Rate Limit',
              mediaCount: 'Rate Limit',
              avgLikes: 'Rate Limit',
              avgComments: 'Rate Limit',
              avgReach: 'Rate Limit',
              engagementRate: 'Rate Limit'
            };
          } else {
            const cnt = reels.length;
            const totalLikes = reels.reduce((sum, r) => sum + (r.like_count || 0), 0);
            const totalComments = reels.reduce((sum, r) => sum + (r.comments_count || 0), 0);
            const totalViews = reels.reduce((sum, r) => sum + (r.view_count || 0), 0);

            rowData = {
              Username: username,
              followers: formatNumber(followers),
              mediaCount: mediaCount,
              avgLikes: cnt ? Math.round(totalLikes / cnt) : 0,
              avgComments: cnt ? Math.round(totalComments / cnt) : 0,
              avgReach: cnt ? formatReach(totalViews / cnt) : '0',
              engagementRate: (cnt && followers) ? (((totalLikes + totalComments) / (followers * cnt)) * 100).toFixed(2) + '%' : '0.00%'
            };
          }

          rows.push(rowData);

          io.emit('progressUpdate', {
            progress: Math.round(((count + 1) / usernames.length) * 100),
            currentUser: username
          });

          await new Promise(resolve => setTimeout(resolve, 5000));
        }

        if (quotaExceeded) {
          for (let i = 0; i < rows.length; i++) {
            rows[i] = {
              Username: rows[i].Username,
              followers: 'Rate Limit',
              mediaCount: 'Rate Limit',
              avgLikes: 'Rate Limit',
              avgComments: 'Rate Limit',
              avgReach: 'Rate Limit',
              engagementRate: 'Rate Limit'
            };
          }
        }

        const writer = createCsvWriter({
          path: outputFile,
          header: [
            { id: 'Username', title: 'Username' },
            { id: 'followers', title: 'Followers' },
            { id: 'mediaCount', title: 'Posts Checked' },
            { id: 'avgLikes', title: 'Avg Likes' },
            { id: 'avgComments', title: 'Avg Comments' },
            { id: 'avgReach', title: 'Avg Reach' },
            { id: 'engagementRate', title: 'Engagement Rate (%)' },
          ]
        });

        await writer.writeRecords(rows);

        res.download(outputFile);
      })
      .on('error', err => {
        console.error('CSV Processing Error:', err.message);
        res.status(500).send('CSV processing failed.');
      });
  });

  return router;
};
