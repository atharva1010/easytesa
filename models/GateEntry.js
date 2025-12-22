const mongoose = require("mongoose");

const gateEntrySchema = new mongoose.Schema({
  token: {
    type: String,
    required: true
  },
  plant: {
    type: String,
    default: "Internal Vehicle"
  },
  status: {
    type: String,
    enum: ["Active", "Lost", "Damage", "Error"],
    default: "Active"
  },
  remark: {
    type: String,
    default: ""
  },
  saved: {
    type: Boolean,
    default: true
  },
  updatedDateTime: {
    type: String
  },
  shiftPerson: {
    type: String
  }
});

module.exports = mongoose.model("GateEntry", gateEntrySchema);
