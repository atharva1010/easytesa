const mongoose = require('mongoose');

const updateSchema = new mongoose.Schema({
  title: String,
  message: String,
  imageUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("Update", updateSchema);
