// models/Methanol.js
const mongoose = require('mongoose');

const methanolSchema = new mongoose.Schema({
  date: String,
  vehicleNo: String,
  material: String,
  outsideWeight: Number,
  mtWeight: Number,
  difference: {
    type: Number,
    default: 0
  },
  name: String,
}, { timestamps: true });

module.exports = mongoose.model("Methanol", methanolSchema);
