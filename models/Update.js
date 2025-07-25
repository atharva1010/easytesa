const mongoose = require("mongoose");

const updateSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  image: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Update", updateSchema);
