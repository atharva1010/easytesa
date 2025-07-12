const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Upload = require("./models/Upload");

const router = express.Router();

// 📁 Upload folder path
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

// 📦 Multer config
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// 📤 Upload endpoint
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const { category, uploadedBy } = req.body;
    const file = req.file;

    if (!file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const newUpload = new Upload({
      filename: file.filename,
      filetype: file.mimetype.startsWith("image/") ? "image" : "excel",
      category: category || "",
      uploadedBy: uploadedBy || "unknown"
    });

    await newUpload.save();

    res.json({ success: true, message: "File uploaded successfully", data: newUpload });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 📥 Fetch all uploads
router.get("/", async (req, res) => {
  try {
    const uploads = await Upload.find().sort({ date: -1 });
    res.json({ success: true, data: uploads });
  } catch (err) {
    console.error("Fetch Uploads Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
