// Instagram Metrics API with Rate Limit Extension Considerations
require("dotenv").config();
const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const app = express();
const port = process.env.PORT || 3000;
const igBusinessAccountId = process.env.IGBUSSINESS_ID;
const accessToken = process.env.ACCESS_TOKEN_SECRET;

if (!igBusinessAccountId || !accessToken) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const OUTPUT_DIR = path.resolve(__dirname, "outputs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
}).single("file");

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

function formatNumber(num) {
  return num >= 1e6 ? (num / 1e6).toFixed(2) + "M"
    : num >= 1e3 ? (num / 1e3).toFixed(1) + "K"
    : num.toString();
}

function formatReach(value) {
  if (value < 1000) return Math.round(value).toString();
  if (value < 1e6) return (value / 1e3).toFixed(1).replace(/\.0$/, '') + "K";
  return (value / 1e6).toFixed(2).replace(/\.00$/, '') + "M";
}

async function safeApiCall(url, retries = 3, delay = 3000) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await axios.get(url);
      return resp;
    } catch (err) {
      const msg = err.response?.data?.error?.message?.toLowerCase() || err.message.toLowerCase();
      if (msg.includes("rate limit") || msg.includes("limit")) {
        if (i < retries - 1) {
          console.warn(`Rate limit hit. Retrying in ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
        } else {
          throw err;
        }
      } else {
        throw err;
      }
    }
  }
}

app.get("/", (req, res) => res.render("home", { title: "Reach Tool" }));

app.get("/upload", (req, res) => res.render("features/f1", { title: "Feature 1" }));

app.post("/feature/f1/upload", (req, res) => {
  upload(req, res, err => {
    if (err) return res.status(500).send("Error uploading file.");
    res.redirect("/feature/celebrities");
  });
});

app.get("/feature/celebrities", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, "celebs_instagram.csv");
  const results = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", row => results.push(row))
    .on("end", () => res.render("features/clebsData", { result: results }))
    .on("error", () => res.status(500).send("Could not read CSV file."));
});

app.get("/instagram/:username", async (req, res) => {
  const USER = req.params.username;
  const TARGET = 12;
  const PAGE_SIZE = 30;

  let reels = [], cursor = null, data = null;

  try {
    do {
      const fieldsPart = `business_discovery.username(${USER}){followers_count,media_count,media.limit(${PAGE_SIZE}){comments_count,like_count,view_count,media_product_type}}`;
      let url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${fieldsPart}&access_token=${accessToken}`;
      if (cursor) url += `&after=${cursor}`;

      const resp = await safeApiCall(url);
      data = resp.data.business_discovery;
      if (!data) throw new Error("No data returned");

      const items = data.media?.data || [];
      reels.push(...items.filter(i => i.media_product_type === "REELS"));
      reels = reels.slice(0, TARGET);

      cursor = data.media?.paging?.cursors?.after;
    } while (reels.length < TARGET && cursor);

    if (!reels.length) throw new Error("No Reels found");

    const followers = data.followers_count || 0;
    const mediaCount = data.media_count || 0;
    const totalViews = reels.reduce((sum, r) => sum + (r.view_count || 0), 0);
    const totalLikes = reels.reduce((sum, r) => sum + (r.like_count || 0), 0);
    const totalComments = reels.reduce((sum, r) => sum + (r.comments_count || 0), 0);

    const avgLikes = Math.round(totalLikes / reels.length);
    const avgComments = Math.round(totalComments / reels.length);
    const avgReach = formatReach(totalViews / reels.length);

    const engagement = followers
      ? (((totalLikes + totalComments) / (followers * reels.length)) * 100).toFixed(2)
      : "0.00";

    res.render("Reach/profile", {
      username: USER,
      followers: formatNumber(followers),
      mediaCount, avgLikes, avgComments, avgReach, engagement
    });

  } catch (err) {
    console.error("Fetch error:", err.message);
    const msg = err.message.toLowerCase();
    const isQuota = msg.includes("limit") || msg.includes("rate limit") || err.response?.status === 403;
    res.render("Reach/error", { message: isQuota ? "API quota reached or rate limit exceeded." : msg });
  }
});

app.get("/download/csv", (req, res) => {
  const inputFile = path.join(UPLOAD_DIR, "celebs_instagram.csv");
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
      for (const USER of usernames) {
        let reels = [], followers = 0, mediaCount = 0, cursor = null;

        try {
          do {
            const fields = `business_discovery.username(${USER}){followers_count,media_count,media.limit(30){comments_count,like_count,view_count,media_product_type,paging{cursors}}}`;
            const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=${fields}&access_token=${accessToken}`;
            const resp = await safeApiCall(url);
            const data = resp.data.business_discovery;

            if (!data) throw new Error("No data returned");
            followers = data.followers_count || 0;
            mediaCount = data.media_count || 0;
            const items = data.media?.data || [];
            reels.push(...items.filter(i => i.media_product_type === "REELS"));
            reels = reels.slice(0, 12);
            cursor = data.media?.paging?.cursors?.after;
          } while (reels.length < 12 && cursor);

        } catch (err) {
          const msg = err?.response?.data?.error?.message?.toLowerCase() || err?.message?.toLowerCase() || "";
          if (msg.includes("limit") || msg.includes("rate limit") || err.response?.status === 403) quotaExceeded = true;
        }

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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});