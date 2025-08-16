const mongoose = require('mongoose');

const shiftReportSchema = new mongoose.Schema(
  {
    date: { type: String, required: true }, // YYYY-MM-DD from your frontend
    shift: { type: String, required: true }, // e.g., 'A', 'B', 'C' or '06:00-09:00'
    plant: { type: String, required: true }, // 'C34A' | 'C2' | 'C3'
    shiftPerson: { type: String },

    woodReceived: { type: Number, default: 0 },
    woodSAP: { type: Number, default: 0 },
    woodPending: { type: Number, default: 0 },

    storeReceived: { type: Number, default: 0 },
    storeSAP: { type: Number, default: 0 },
    storePending: { type: Number, default: 0 },

    dispatchReceived: { type: Number, default: 0 },
    dispatchSAP: { type: Number, default: 0 },
    dispatchPending: { type: Number, default: 0 },

    lossTokens: { type: Number, default: 0 },
    totalTokens: { type: Number, default: 0 },
    inStockTokens: { type: Number, default: 0 },
    issuedTokens: { type: Number, default: 0 },

    remarks: { type: String, default: '' },

    // Link to the user who saved it (from JWT)
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  { timestamps: true }
);

// Helpful index to quickly find latest report per plant/shift/date
shiftReportSchema.index({ plant: 1, date: 1, shift: 1 }, { unique: false });

module.exports = mongoose.model('ShiftReport', shiftReportSchema);
