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

// Directories
const UPLOAD_DIR = path.resolve(__dirname, "uploads");
const OUTPUT_DIR = path.resolve(__dirname, "outputs");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

// Multer setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
}).single("file");

// Middleware
app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

// Home page
app.get("/", (req, res) => {
  res.render("home", { title: "Reach Tool" });
});

// Upload page
app.get("/upload", (req, res) => {
  res.render("features/f1", { title: "Feature 1" });
});

app.post("/feature/f1/upload", (req, res) => {
  upload(req, res, (err) => {
    if (err) return res.status(500).send("Error uploading file.");
    res.send("File uploaded successfully.");
  });
});

// CSV view
app.get("/feature/celebrities", (req, res) => {
  const filePath = path.join(UPLOAD_DIR, "celebs_instagram.csv");
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => results.push(row))
    .on("end", () => res.render("features/clebsData", { result: results }))
    .on("error", () => res.status(500).send("Could not read CSV file."));
});
// Instagram profile fetch for a single user with avgReach as average view count (in millions)
app.get("/instagram/:username", async (req, res) => {
  const { username } = req.params;

  const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=business_discovery.username(${username}){followers_count,media_count,media.limit(12){comments_count,like_count,view_count,media_url,caption,timestamp}}&access_token=${accessToken}`;

  try {
    const response = await axios.get(url);
    const data = response.data.business_discovery;

    if (!data) {
      return res.render("Reach/error", {
        message: "No data returned for the username.",
      });
    }

    const media = data.media?.data || [];
    if (!media.length) {
      return res.render("Reach/error", {
        message: "No recent posts found for this account.",
      });
    }

    const recent = media.slice(0, 12);
    const followers = data.followers_count || 0;
    const mediaCount = data.media_count || 0;

    const totalLikes = recent.reduce((sum, post) => sum + (post.like_count || 0), 0);
    const totalComments = recent.reduce((sum, post) => sum + (post.comments_count || 0), 0);
    const totalViews = recent.reduce((sum, post) => sum + (post.view_count || 0), 0);

    const count = recent.length;
    const avgLikes = count ? Math.round(totalLikes / count) : 0;
    const avgComments = count ? Math.round(totalComments / count) : 0;
    const avgReach = count ? ((totalViews+totalComments+totalLikes) / count / 1e6).toFixed(2) + 'M' : "0M";

    const engagement = followers && count
      ? (((totalLikes + totalComments) / (followers * count)) * 100).toFixed(2)
      : "0.00";

    const formatFollowers = (f) =>
      f >= 1e6 ? (f / 1e6).toFixed(2) + "M" :
      f >= 1e3 ? (f / 1e3).toFixed(1) + "K" : f;

    res.render("Reach/profile", {
      username,
      followers: formatFollowers(followers),
      mediaCount,
      avgLikes,
      avgComments,
      avgReach,
      engagement,
    });
  } catch (err) {
    const status = err.response?.status;
    const errorMsg = err.response?.data?.error?.message || err.message;

    if (status === 403 || errorMsg.includes("limit") || errorMsg.includes("quota")) {
      return res.render("Reach/error", {
        message: "API quota limit reached. Please try again later.",
      });
    }

    if (status === 400 || errorMsg.includes("does not exist")) {
      return res.render("Reach/error", {
        message: `The username "${username}" is not valid or not a business/creator account.`,
      });
    }

    console.error("Fetch error:", errorMsg);
    res.render("Reach/error", {
      message: "Error fetching Instagram data. Please try again later.",
    });
  }
});

// Download CSV endpoint with avgReach as average view count (in millions)
app.get("/download/csv", async (req, res) => {
  const inputFile = path.join(UPLOAD_DIR, "celebs_instagram.csv");
  const outputFile = path.join(OUTPUT_DIR, "instagram_full_report.csv");

  const usernames = [];
  const rows = [];

  let quotaExceeded = false;

  try {
    for await (const row of fs.createReadStream(inputFile).pipe(csv())) {
      const user = row.Username?.trim();
      if (user) usernames.push(user);
    }

    for (const username of usernames) {
      let followers = 0,
        mediaCount = 0,
        totalLikes = 0,
        totalComments = 0,
        totalViews = 0;

      let avgLikes = 0,
        avgComments = 0,
        avgReach = "0M",
        engagementRate = "0.00%";

      try {
        const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=business_discovery.username(${username}){followers_count,media_count,media.limit(12){comments_count,like_count,view_count}}&access_token=${accessToken}`;
        const response = await axios.get(url);
        const data = response.data.business_discovery;

        followers = data.followers_count || 0;
        mediaCount = data.media_count || 0;
        const recent = (data.media?.data || []).slice(0, 12);

        recent.forEach(post => {
          totalLikes += post.like_count || 0;
          totalComments += post.comments_count || 0;
          totalViews += post.view_count || 0;
        });

        const count = recent.length;
        if (count > 0 && followers > 0) {
          avgLikes = Math.round(totalLikes / count);
          avgComments = Math.round(totalComments / count);
          avgReach = ((totalViews+totalComments+totalLikes) / count / 1e6).toFixed(2) + 'M';
          engagementRate = (((totalLikes + totalComments) / (followers * count)) * 100).toFixed(2) + "%";
        }
      } catch (err) {
        const code = err.response?.status;
        const message = err.response?.data?.error?.message;

        if (code === 403 || message?.includes("limit")) {
          console.warn(`Quota hit at ${username}. Skipping remaining users.`);
          quotaExceeded = true;
          break;
        }

        console.error(`${username} fetch failed:`, err.message);
        followers = mediaCount = totalLikes = totalComments = totalViews = avgLikes = avgComments = "Error";
        avgReach = "Error";
        engagementRate = "Error";
      }

      rows.push({
        username,
        followers,
        mediaCount,
        avgLikes,
        avgComments,
        avgReach,
        engagementRate,
      });

      console.log(
        `Processed ${username}: Followers=${followers}, MediaCount=${mediaCount}, AvgLikes=${avgLikes}, AvgComments=${avgComments}, AvgReach=${avgReach}, EngagementRate=${engagementRate}`
      );

      await new Promise((r) => setTimeout(r, 1500));
    }

    const csvWriter = createCsvWriter({
      path: outputFile,
      header: [
        { id: "username", title: "Username" },
        { id: "followers", title: "Followers" },
        { id: "mediaCount", title: "Total Posts" },
        { id: "avgLikes", title: "Average Likes" },
        { id: "avgComments", title: "Average Comments" },
        { id: "avgReach", title: "Average Reach (Million)" },
        { id: "engagementRate", title: "Engagement Rate (%)" },
      ],
    });

    await csvWriter.writeRecords(rows);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="instagram_celebs_report.csv"');

    res.download(outputFile, () => {
      if (quotaExceeded) {
        console.warn("Partial data written due to quota limit.");
      }
    });
  } catch (err) {
    console.error("CSV Generation Error:", err.message);
    res.status(500).send("Failed to generate CSV.");
  }
});
// Start server
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

