const mongoose = require('mongoose');

const woodReportSchema = new mongoose.Schema({
  sapDate: String,
  billDate: String,
  quantity: Number,
  submitTime: String,
  receiverName: String,
  submittedBy: String,
  plant: String
}, { timestamps: true });

module.exports = mongoose.model('WoodReport', woodReportSchema);
