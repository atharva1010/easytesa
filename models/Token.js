const mongoose = require("mongoose");

const tokenSchema = new mongoose.Schema({
  tokenNo: String,
  plant: String,
  status: String,
  remark: String,
  updatedDateTime: String,
  shiftPerson: String,
  transferredTo: String
});

module.exports = mongoose.model("Token", tokenSchema);
