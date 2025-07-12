const mongoose = require('mongoose');

const shiftReportSchema = new mongoose.Schema({
  date: {
    type: Date,
    required: true
  },
  plant: {
    type: String,
    required: true,
    enum: ['C2', 'C3', 'C34A']
  },
  shift: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', '06:00-09:00']
  },
  shiftPerson: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  woodReceived: {
    type: Number,
    default: 0
  },
  woodSAP: {
    type: Number,
    default: 0
  },
  storeReceived: {
    type: Number,
    default: 0
  },
  storeSAP: {
    type: Number,
    default: 0
  },
  dispatchReceived: {
    type: Number,
    default: 0
  },
  dispatchSAP: {
    type: Number,
    default: 0
  },
  lossTokens: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Token'
  }],
  inStockTokens: {
    type: Number,
    default: 0
  },
  remarks: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('ShiftReport', shiftReportSchema);
