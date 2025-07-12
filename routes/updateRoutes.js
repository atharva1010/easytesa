const express = require("express");
const multer = require("multer");
const path = require("path");
const router = express.Router();
const Update = require("../models/Update");

// Setup multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// POST: Create a new update
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const { title, message } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : null;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required." });
    }

    const update = new Update({
      title,
      message,
      image
    });

    await update.save();
    res.json({ success: true, message: "Update posted successfully" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to post update" });
  }
});

// GET: All updates (optional)
router.get("/", async (req, res) => {
  try {
    const updates = await Update.find().sort({ createdAt: -1 });
    res.json({ success: true, updates });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch updates" });
  }
});

module.exports = router;
