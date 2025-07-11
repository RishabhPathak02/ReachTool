const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

const router = express.Router();

const UPLOAD_DIR = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const fileFilter = (req, file, cb) => {
  const isCsv = file.mimetype === 'text/csv' || file.originalname.endsWith('.csv');
  cb(isCsv ? null : new Error('Only CSV files are allowed!'), isCsv);
};

const upload = multer({ storage, fileFilter }).single('file');

router.get('/', (req, res) => {
  res.render('features/f1', { title: 'Feature 1' });
});

router.post('/', (req, res) => {
  upload(req, res, (err) => {
    if (err) return res.status(400).send('Error: ' + err.message);
    if (!req.file) return res.status(400).send('No file uploaded!');

    const uploadedFileName = req.file.filename;

    try {
      const files = fs.readdirSync(UPLOAD_DIR);
      files.forEach(file => {
        const filePath = path.join(UPLOAD_DIR, file);
        if (fs.lstatSync(filePath).isFile() && file !== uploadedFileName) {
          fs.unlinkSync(filePath);
        }
      });
      req.app.locals.uploadedFile = uploadedFileName;
      res.redirect('/feature/celebrities');
    } catch (error) {
      console.error('Cleanup failed:', error);
      res.status(500).send('Upload succeeded but cleanup failed.');
    }
  });
});

module.exports = router;
