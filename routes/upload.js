const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Multer Setup
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => cb(null, file.originalname),
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed!'), false);
    }
  }
}).single("file");

// GET /upload - Show Upload Form
router.get("/", (req, res) => {
  res.render("features/f1", { title: "Feature 1" });
});

// POST /upload - Handle Upload with Auto Delete Old File
router.post("/", (req, res) => {
  upload(req, res, err => {
    if (err) return res.status(500).send("Error: " + err.message);

    if (!req.file) return res.status(400).send("No file uploaded!");

    const uploadedFileName = req.file.filename;

    try {
      // Auto Delete Old Files Except Latest Uploaded File
      fs.readdirSync(UPLOAD_DIR).forEach(file => {
        const filePath = path.join(UPLOAD_DIR, file);

        // Delete only files (not directories) and skip the current uploaded file
        if (fs.lstatSync(filePath).isFile() && file !== uploadedFileName) {
          fs.unlinkSync(filePath);
        }
      });

      // Optionally store uploaded file name globally
      req.app.locals.uploadedFile = uploadedFileName;

      res.redirect("/feature/celebrities");
    } catch (deleteErr) {
      console.error("Failed to delete old files:", deleteErr);
      return res.status(500).send("Upload succeeded but cleanup failed.");
    }
  });
});

module.exports = router;