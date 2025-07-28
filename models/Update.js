const mongoose = require("mongoose");

const updateSchema = new mongoose.Schema({
  title: String,
  message: String,
  image: String, // Cloudinary image URL
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Update", updateSchema);
