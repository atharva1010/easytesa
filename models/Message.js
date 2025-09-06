const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  from: { type: String, required: true },   // Sender userId
  to: { type: String, required: true },     // Receiver userId
  message: { type: String, required: true },

  // Delivery & Seen status
  delivered: { type: Boolean, default: false },
  deliveredTimestamp: { type: Date, default: null },
  seen: { type: Boolean, default: false },
  seenTimestamp: { type: Date, default: null },

  // Edit & Delete tracking
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },

  // Created timestamp
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);
