const express = require('express');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, "../uploads");

// 🔑 Helper function to get the latest uploaded CSV file
function getLatestUploadedFile() {
  const files = fs.readdirSync(UPLOAD_DIR).filter(file => file.endsWith('.csv'));
  
  if (files.length === 0) return null;

  // Optional: Sort files by last modified time if multiple files exist
  const sortedFiles = files
    .map(file => {
      const filePath = path.join(UPLOAD_DIR, file);
      const stats = fs.statSync(filePath);
      return { file, time: stats.mtime };
    })
    .sort((a, b) => b.time - a.time);

  return sortedFiles[0].file; // Latest file name
}

// GET /feature/celebrities - Show Uploaded CSV Data
router.get("/", (req, res) => {
  const uploadedFile = getLatestUploadedFile();

  if (!uploadedFile) {
    return res.status(404).send("❗ No CSV file uploaded yet.");
  }

  const filePath = path.join(UPLOAD_DIR, uploadedFile);
  const results = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", row => results.push(row))
    .on("end", () => res.render("features/clebsData", { result: results }))
    .on("error", () => res.status(500).send("❗ Could not read CSV file."));
});

module.exports = router;
