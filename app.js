const express = require("express");
const path = require("path");
const methodOverride = require("method-override");
const ejsMate = require("ejs-mate");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const axios = require("axios");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT;
const igBusinessAccountId = process.env.IGBUSSINESS_ID;
const accessToken = process.env.ACCESS_TOKEN_SECRET;

app.engine("ejs", ejsMate);
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride("_method"));
app.use(express.static(path.join(__dirname, "public")));

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "./uploads"),
  filename: (req, file, cb) => cb(null, file.originalname),
});
const upload = multer({ storage: diskStorage }).single("file");

app.get("/", (req, res) => {
  res.render("home", { title: "Reach Tool" });
});

app.get("/upload", (req, res) => {
  res.render("features/f1", { title: "Feature 1" });
});

app.post("/feature/f1/upload", (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res.status(500).send("Error uploading file.");
    }
    console.log("Uploaded File:", req.file);
    res.status(200).send("File uploaded successfully.");
  });
});

app.get("/feature/celebrities", (req, res) => {
  const filePath = path.join(__dirname, "uploads", "celebs_instagram.csv");
  const results = [];
  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => results.push(row))
    .on("end", () => {
      console.log(`Parsed ${results.length} records from CSV.`);
      res.render("features/clebsData", { result: results });
    })
    .on("error", (err) => {
      console.error("CSV read error:", err);
      res.status(500).send("Could not read CSV file.");
    });
});

app.get("/instagram/:username", async (req, res) => {
  const { username } = req.params;
  const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=business_discovery.username(${username}){followers_count,media_count,media{comments_count,like_count,view_count,media_url,caption,timestamp}}&access_token=${accessToken}`;

  try {
    const response = await axios.get(url);
    const data = response.data.business_discovery;
    console.log(`Fetched data for ${username}:`, data);

    if (data) {
      const media = data.media?.data || [];
      const rawfollowers = data.followers_count || 1;
      const followers = (rawfollowers/1000000).toFixed(2) + "M"; // Convert to millions for better readability
      const totalEngagement = media.reduce(
        (acc, post) =>
          acc + (post.comments_count || 0) + (post.like_count || 0),
        0
      );
      const engagementRate = ((totalEngagement / rawfollowers) * 100).toFixed(2);

      res.render("Reach/profile", {
        username,
        followers,
        mediaCount: data.media_count,
        recentMedia: media,
        engagement: engagementRate,
      });
    } else {
      res.render("Reach/error", { message: "User not found or inaccessible." });
    }
  } catch (error) {
    console.error("Fetch error:", error.response?.data || error.message);
    res.render("Reach/error", { message: "Error fetching Instagram data." });
  }
});

app.get("/download/csv", async (req, res) => {
  const inputFile = path.join(__dirname, "uploads", "celebs_instagram.csv");
  const outputDir = path.join(__dirname, "outputs");
  const outputFile = path.join(outputDir, "celebs_instagram_output.csv");

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir);

  const usernames = [];

  try {
    const readStream = fs.createReadStream(inputFile).pipe(csv());

    for await (const row of readStream) {
      if (row.Username) usernames.push(row.Username.trim());
    }

    const profileData = [];

    for (const username of usernames) {
      const url = `https://graph.facebook.com/v23.0/${igBusinessAccountId}?fields=business_discovery.username(${username}){followers_count,media_count,media{comments_count,like_count,view_count}}&access_token=${accessToken}`;

      try {
        const response = await axios.get(url);
        const data = response.data.business_discovery;
        const media = data.media?.data || [];
        const followers = data.followers_count|| 0;

        const totalLikes = media.reduce(
          (acc, post) => acc + (post.like_count || 0),
          0
        );
        const totalComments = media.reduce(
          (acc, post) => acc + (post.comments_count || 0),
          0
        );
        const totalEngagement = totalLikes + totalComments;
        const engagementRate =
          followers > 0
            ? ((totalEngagement / followers) * 100).toFixed(2)
            : "0.00";

        profileData.push({
          username,
          followers: followers.toString(),
          totalLikes: totalLikes.toString(),
          totalComments: totalComments.toString(),
          engagementRate: engagementRate.toString() + "%",
        });
        await new Promise((resolve) => setTimeout(resolve, 1000)); // delay to avoid rate limits
      } catch (err) {
        console.error(`Error fetching ${username}:`, err.message);
        profileData.push({
          username,
          followers: "Error",
          totalLikes: "Error",
          totalComments: "Error",
          engagementRate: "Error",
        });
      }
    }

    const csvWriter = createCsvWriter({
      path: outputFile,
      header: [
        { id: "username", title: "Username" },
        { id: "followers", title: "Followers" },
        { id: "totalLikes", title: "Total Likes" },
        { id: "totalComments", title: "Total Comments" },
        { id: "engagementRate", title: "Engagement Rate (%)" },
      ],
    });

    await csvWriter.writeRecords(profileData);
    console.log("CSV generated successfully.");
    res.download(outputFile, "instagram_engagement_report.csv");
  } catch (error) {
    console.error("General Error:", error.message);
    res.status(500).send("Something went wrong.");
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
