// models/Upload.js

const mongoose = require("mongoose");

const uploadSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  filetype: { type: String, required: true }, // "image", "excel", etc.
  category: { type: String }, // e.g., "Wood PO", "Intercom", etc.
  uploadedBy: { type: String }, // userId or username
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Upload", uploadSchema);
