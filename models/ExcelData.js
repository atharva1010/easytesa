const mongoose = require("mongoose");

const excelDataSchema = new mongoose.Schema({
  category: {
    type: String,
    required: true
  },
  data: {
    type: Array,
    required: true // Array of arrays (each Excel row)
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model("ExcelData", excelDataSchema);
