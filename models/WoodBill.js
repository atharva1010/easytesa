const mongoose = require('mongoose');

const woodBillSchema = new mongoose.Schema({
  sapDate: {
    type: Date,
    required: true
  },
  billDate: {
    type: Date,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  submitTime: {
    type: String,
    required: true
  },
  receiverName: {
    type: String,
    default: ""
  },
  submittedBy: {
    type: String,
    required: true,
    uppercase: true
  },
  plant: {
    type: String,
    required: true,
    enum: ['C34A', 'C2', 'C3'],
    uppercase: true
  },
  receiverStatus: {
    type: String,
    enum: ['Pending by Receiver', 'Received by Security', 'Received'],
    default: 'Pending by Receiver'
  },
  isReceived: {
    type: Boolean,
    default: false
  },
  receivedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WoodBill', woodBillSchema);
