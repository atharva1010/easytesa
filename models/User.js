const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: { type: String, required: true },
  userId: { type: String, required: true, unique: true },
  department: { type: String, required: true },
  designation: { type: String, required: true },
  mobile: { type: String }, // optional
  email: { type: String },
  role: { type: String, enum: ["admin", "user"], required: true },
  password: { type: String, required: true },
  profilePic: { type: String } // image file path if uploaded
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
