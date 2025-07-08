const express = require('express');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const { safeApiCall, formatNumber, formatReach } = require('../utils/helpers');

const router = express.Router();

module.exports = (io) => {
  router.get("/", (req, res) => {
    const UPLOAD_DIR = path.resolve(__dirname, "../uploads");
    const OUTPUT_DIR = path.resolve(__dirname, "../outputs");
    const igBusinessAccountId = process.env.IGBUSSINESS_ID;
    const accessToken = process.env.ACCESS_TOKEN_SECRET;

    // ✅ Get the latest uploaded CSV file from uploads
    const files = fs.readdirSync(UPLOAD_DIR).filter(f => f.endsWith('.csv'));
    if (files.length === 0) return res.status(400).send("❗No CSV file uploaded. Please upload first.");

    const inputFile = path.join(UPLOAD_DIR, files[0]);  // Always picks the only/latest CSV
    const outputFile = path.join(OUTPUT_DIR, "instagram_report.csv");

    const usernames = [];
    const rows = [];
    let quotaExceeded = false;

    fs.createReadStream(inputFile)
      .pipe(csv())
      .on("data", (row) => {
        if (row.Username) usernames.push(row.Username.trim());
      })
      .on("end", async () => {
        const total = usernames.length;
        let count = 0;

        for (const USER of usernames) {
          let reels = [], followers = 0, mediaCount = 0, cursor = null;
          let userQuotaExceeded = false;

          try {
            do {
              const fields = `business_discovery.username(${USER}){followers_count,media_count,media.limit(30){comments_count,like_count,view_count,media_product_type,paging{cursors}}}`;
              const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${fields}&access_token=${accessToken}`;
              const resp = await safeApiCall(url);
              const data = resp.data.business_discovery;

              followers = data.followers_count || 0;
              mediaCount = data.media_count || 0;
              const items = data.media?.data || [];
              reels.push(...items.filter(i => i.media_product_type === "REELS"));
              reels = reels.slice(0, 12);
              cursor = data.media?.paging?.cursors?.after;
            } while (reels.length < 12 && cursor);
          } catch (err) {
            const msg = err?.response?.data?.error?.message?.toLowerCase() || err?.message?.toLowerCase() || "";
            if (msg.includes("limit") || msg.includes("rate limit") || err.response?.status === 403) {
              quotaExceeded = true;
              userQuotaExceeded = true;
            }
          }

          if (userQuotaExceeded) {
            rows.push({
              Username: USER,
              followers: "Limit Hit",
              mediaCount: "Limit Hit",
              avgLikes: "Limit Hit",
              avgComments: "Limit Hit",
              avgReach: "Limit Hit",
              engagementRate: "Limit Hit"
            });
          } else {
            const cnt = reels.length;
            const totalLikes = reels.reduce((s, r) => s + (r.like_count || 0), 0);
            const totalComments = reels.reduce((s, r) => s + (r.comments_count || 0), 0);
            const totalViews = reels.reduce((s, r) => s + (r.view_count || 0), 0);

            rows.push({
              Username: USER,
              followers: formatNumber(followers),
              mediaCount,
              avgLikes: cnt ? Math.round(totalLikes / cnt) : 0,
              avgComments: cnt ? Math.round(totalComments / cnt) : 0,
              avgReach: cnt ? formatReach(totalViews / cnt) : "0",
              engagementRate: (cnt && followers) ? (((totalLikes + totalComments) / (followers * cnt)) * 100).toFixed(2) + "%" : "0.00%"
            });
          }

          count++;
          const percent = Math.round((count / total) * 100);
          io.emit('progressUpdate', { progress: percent });

          if (quotaExceeded) break;
          await new Promise(r => setTimeout(r, 2500));
        }

        const writer = createCsvWriter({
          path: outputFile,
          header: [
            { id: "Username", title: "Username" },
            { id: "followers", title: "Followers" },
            { id: "mediaCount", title: "Posts Checked" },
            { id: "avgLikes", title: "Avg Likes" },
            { id: "avgComments", title: "Avg Comments" },
            { id: "avgReach", title: "Avg Reach" },
            { id: "engagementRate", title: "Engagement Rate (%)" }
          ]
        });

        await writer.writeRecords(rows);
        res.setHeader("Content-Disposition", 'attachment; filename="instagram_report.csv"');
        res.download(outputFile);
      });
  });

  return router;
};
