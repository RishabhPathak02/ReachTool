const express = require('express');
const path = require('path');
const csv = require('csv-parser');
const fs = require('fs');
const { extractUsername } = require('../utils/helpers');

const router = express.Router();
const UPLOAD_DIR = path.resolve(__dirname, "../uploads");

function getLatestUploadedFile() {
  const files = fs.readdirSync(UPLOAD_DIR).filter(file => file.endsWith('.csv'));
  if (!files.length) return null;
  return files.map(file => ({
    file,
    time: fs.statSync(path.join(UPLOAD_DIR, file)).mtime
  })).sort((a, b) => b.time - a.time)[0].file;
}

router.get("/", (req, res) => {
  const uploadedFile = getLatestUploadedFile();
  if (!uploadedFile) return res.status(404).send("❗ No CSV file uploaded yet.");

  const filePath = path.join(UPLOAD_DIR, uploadedFile);
  const results = [];

  const nameRegex = /(name)/i;
  const usernameRegex = /(username|profile|link|instagram|insta|url)/i;

  fs.createReadStream(filePath)
    .pipe(csv())
    .on("data", (row) => {
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
      results.push({ Name: name || '', Username: username || '' });
    })
    .on("end", () => res.render("features/clebsData", { result: results }))
    .on("error", (err) => {
      console.error("CSV Read Error:", err);
      res.status(500).send("❗ Could not read CSV file.");
    });
});

module.exports = router;
