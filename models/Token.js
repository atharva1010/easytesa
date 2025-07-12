const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  cardNumber: {
    type: String,
    required: true,
    unique: true
  },
  plant: {
    type: String,
    required: true,
    enum: ['C2', 'C3', 'C34A']
  },
  status: {
    type: String,
    required: true,
    enum: ['Active', 'Inactive', 'Lost'],
    default: 'Active'
  },
  problemDescription: {
    type: String,
    default: ''
  },
  reportedDate: {
    type: Date,
    default: Date.now
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reportSource: {
    type: String,
    enum: ['System', 'ShiftReport', 'Manual'],
    default: 'System'
  },
  activatedDate: {
    type: Date
  },
  notes: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Token', tokenSchema);