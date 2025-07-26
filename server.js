
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs"); // Using bcryptjs instead of bcrypt
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const http = require("http");
const { Server } = require("socket.io");
const twilio = require("twilio");
const multer = require("multer");
const { uploadUser } = require('./cloudinary');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: userStorage });
// Models
const User = require("./models/User");
const Update = require("./models/Update");
const ExcelData = require("./models/ExcelData");
const Message = require("./models/Message");
const WoodBill = require('./models/WoodBill');
const Methanol = require("./models/Methanol");
const LongBodyReport = require('./models/LongBodyReport');
const ShiftReport = require('./models/ShiftReport');

// Routes
const shiftReportRoutes = require("./routes/shiftReportRoutes");
const updateRoutes = require("./routes/updateRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const longBodyRoutes = require('./routes/longBody');

// Mount Routes
app.use("/api/shift-report", shiftRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/reports/shift", shiftReportRoutes);
app.use("/api/long-body", longBodyRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public'))); // for frontend HTML
app.use('/Files', express.static(path.join(__dirname, 'Files'))); // for serving files like PDFs


// Multer Setup
const userStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname))
});

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "bg/"),
  filename: (req, file, cb) => cb(null, "background.jpg")
});
const uploadBackground = multer({ storage: bgStorage });

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + ".xlsx")
});
const uploadExcel = multer({ storage: excelStorage });

// Middleware
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/bg", express.static("bg"));
app.use("/assets", express.static("assets"));
app.use(express.static("public"));

// DB Connection
mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bab_system", {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log("✅ MongoDB Connected"))
.catch(err => console.error("❌ MongoDB connection error:", err));

// Socket.io Setup
const onlineUsers = {};
io.on("connection", (socket) => {
  console.log("🔌 User connected:", socket.id);

  socket.on("join", async (userId) => {
    onlineUsers[userId] = socket.id;
    socket.userId = userId;

    const messages = await Message.find({
      $or: [{ from: userId }, { to: userId }]
    }).sort({ timestamp: 1 });

    socket.emit("loadMessages", messages);
  });

  socket.on("chatMessage", async (data) => {
    const { from, to, message } = data;
    const newMsg = new Message({ from, to, message });
    await newMsg.save();

    if (onlineUsers[to]) {
      io.to(onlineUsers[to]).emit("chatMessage", newMsg);
    }

    socket.emit("chatMessage", newMsg);
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      console.log("❌ User disconnected:", socket.userId);
    }
  });
});

// Twilio
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const otpStore = new Map();

// ✅ Auth Middleware (Token Verification)
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false, message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, message: "Invalid token" });
  }
};

// Password configuration
const SALT_ROUNDS = 10;

// User Management Endpoints
app.post("/api/create-user", uploadUser.single("profilePic"), async (req, res) => {
  try {
    const {
      userIdUpdate,
      username,
      userId,
      department,
      designation,
      mobile,
      email,
      role,
      password
    } = req.body;

    const profilePic = req.file ? req.file.path : null; // Cloudinary URL

    if (userIdUpdate) {
      const user = await User.findById(userIdUpdate);
      if (!user) return res.json({ success: false, message: "User not found" });

      user.username = username;
      user.department = department;
      user.designation = designation;
      user.mobile = mobile;
      user.email = email;
      user.role = role;

      if (profilePic) user.profilePic = profilePic;
      if (password) user.password = await bcrypt.hash(password, 10);

      await user.save();
      return res.json({ success: true, message: "User updated successfully" });
    } else {
      const existing = await User.findOne({ userId });
      if (existing) return res.json({ success: false, message: "User ID already exists" });

      const hashedPassword = await bcrypt.hash(password, 10);

      const newUser = new User({
        username,
        userId,
        department,
        designation,
        mobile,
        email,
        role,
        password: hashedPassword,
        profilePic: profilePic || ""
      });

      await newUser.save();
      res.json({ success: true, message: "User created successfully" });
    }
  } catch (err) {
    console.error("Create/Update User Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
// Separate Update API (if used)
app.put("/api/update-user/:id", uploadUser.single("profilePic"), async (req, res) => {
  try {
    const { username, department, designation, mobile, email, role, password } = req.body;

    const updates = { username, department, designation, mobile, email, role };
    if (password) updates.password = await bcrypt.hash(password, SALT_ROUNDS);
    if (req.file) updates.profilePic = `/uploads/${req.file.filename}`;

    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!updated) return res.json({ success: false, message: "User not found" });

    res.json({ success: true, message: "User updated" });
  } catch (err) {
    console.error("Update User Error:", err);
    res.json({ success: false, message: "Failed to update user" });
  }
});

// Delete User
app.delete("/api/delete-user/:id", async (req, res) => {
  try {
    const deleted = await User.findByIdAndDelete(req.params.id);
    if (!deleted) return res.json({ success: false, message: "User not found" });
    res.json({ success: true, message: "User deleted" });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.json({ success: false, message: "Failed to delete user" });
  }
});

// Get All Users (excluding password)
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("Get Users Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
});

app.get("/api/users", async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
});

// Auth Endpoints
app.post("/api/login", async (req, res) => {
  const { userId, password } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, message: "Invalid User ID" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.json({ success: false, message: "Incorrect password" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);

    res.json({
      success: true,
      token,
      userId: user.userId,
      username: user.username,
      role: user.role
    });

  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/me", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.json({ success: false });
  res.json({ success: true, user });
});

// File Upload Endpoints
app.post("/api/upload-background", uploadBackground.single("background"), (req, res) => {
  if (!req.file) return res.json({ success: false, message: "Upload failed" });
  res.json({ success: true, message: "Background uploaded" });
});

// ✅ Excel Upload Endpoint (Protected)
app.post("/api/upload-excel", authMiddleware, uploadExcel.single("excelFile"), async (req, res) => {
  try {
    const { category } = req.body;
    const filePath = req.file.path;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    const data = [];

    sheet.eachRow((row) => {
      const rowData = row.values.slice(1); // remove empty first cell
      data.push(rowData);
    });

    const excelData = new ExcelData({
      category,
      data,
      uploadedBy: req.userId
    });

    await excelData.save();

    res.json({ success: true, message: "Excel uploaded and saved" });
  } catch (err) {
    console.error("Excel Upload Error:", err);
    res.json({ success: false, message: "Upload failed" });
  }
});

// ✅ Fetch Excel Data by Category
app.get("/api/excel-data/:category", async (req, res) => {
  try {
    const { category } = req.params;
    const record = await ExcelData.findOne({ category }).sort({ uploadedAt: -1 });
    if (!record) return res.json({ success: false, message: "No data found" });

    res.json({ success: true, data: record.data });
  } catch (err) {
    res.json({ success: false, message: "Failed to fetch data" });
  }
});
// OTP Endpoints

app.post("/api/send-otp", async (req, res) => {

const { userId } = req.body;

const user = await User.findOne({ userId });

if (!user) return res.json({ success: false, message: "User ID not found" });

const otp = Math.floor(100000 + Math.random() * 900000);

otpStore.set(userId, { otp, expires: Date.now() + 5 * 60 * 1000 });

try {

await twilioClient.messages.create({

  body: `Your OTP is: ${otp}`,

  from: process.env.TWILIO_PHONE,

  to: `+91${user.mobile}`

});

res.json({ success: true, message: "OTP sent to registered mobile" });

} catch (err) {

console.error("Twilio Error:", err);

res.json({ success: false, message: "Failed to send OTP" });

}

});

app.post("/api/reset-password", async (req, res) => {

const { userId, otp, newPassword } = req.body;

const stored = otpStore.get(userId);

if (!stored || stored.otp != otp || stored.expires < Date.now()) {

return res.json({ success: false, message: "Invalid or expired OTP" });

}

const user = await User.findOne({ userId });

if (!user) return res.json({ success: false, message: "User not found" });

user.password = await bcrypt.hash(newPassword, 10);

await user.save();

otpStore.delete(userId);

res.json({ success: true, message: "Password reset successful" });

});

app.post("/api/verify-otp", (req, res) => {
  const { userId, otp } = req.body;
  const stored = otpStore.get(userId);

  if (!stored) {
    return res.json({ success: false, message: "OTP not found" });
  }

  if (stored.otp != otp || stored.expires < Date.now()) {
    return res.json({ success: false, message: "Invalid or expired OTP" });
  }

  return res.json({ success: true, message: "OTP verified successfully" });
});



app.post("/api/update-password", async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10); // 🔒 Hash the new password
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Update password error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});


app.post('/api/shift-report/previous-pending', async (req, res) => {
  console.log("✅ Incoming Previous Pending Body:", req.body);  // Debug log

  try {
    const { plant, shift, date } = req.body;

    const shifts = ["A", "B", "C"];
    const currentIndex = shifts.indexOf(shift);
    const previousShift = shifts[(currentIndex + 2) % 3];

    const queryDate = new Date(date);
    if (shift === "A") {
      queryDate.setDate(queryDate.getDate() - 1);
    }

    const formattedDate = queryDate.toISOString().split("T")[0];

    const previous = await ShiftReport.findOne({
      plant,
      shift: previousShift,
      date: formattedDate
    }).sort({ _id: -1 });

    if (!previous) {
      return res.json({ success: true, pending: {} });
    }

    res.json({
      success: true,
      pending: {
        woodPending: previous.woodPending || 0,
        storePending: previous.storePending || 0,
        dispatchPending: previous.dispatchPending || 0
      }
    });

  } catch (err) {
    console.error("❌ Error loading previous shift pending:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/updates", upload.single("image"), async (req, res) => {
  try {
    const { title, message } = req.body;
    const image = req.file ? req.file.filename : null;

    // Save to MongoDB (optional)
    const newUpdate = new Update({ title, message, image });
    await newUpdate.save();

    res.json({ success: true, message: "Update posted successfully" });
  } catch (err) {
    console.error("Error in /api/updates:", err);
    res.status(500).json({ success: false, message: "Failed to post update" });
  }
});

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}


// Material Reports
app.post("/api/wood-bill", async (req, res) => {
  try {
    const newBill = new WoodBill(req.body);
    await newBill.save();
    res.json({ success: true, message: "Data saved successfully", id: newBill._id });
  } catch (err) {
    console.error("Save Wood Bill Error:", err);
    res.status(500).json({ success: false, message: "Save failed" });
  }
});

app.get("/api/wood-bill", async (req, res) => {
  try {
    const data = await WoodBill.find().sort({ createdAt: -1 });
    res.json(data);
  } catch (err) {
    console.error("Fetch Wood Bill Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/methanol", async (req, res) => {
  try {
    let { date, vehicleNo, material, outsideWeight, mtWeight, name } = req.body;

    const outside = parseFloat(outsideWeight);
    const mt = parseFloat(mtWeight);

    if (isNaN(outside) || isNaN(mt)) {
      return res.status(400).json({
        success: false,
        message: "Invalid weight values. Both weights must be numeric."
      });
    }

    const difference = parseFloat((outside - mt).toFixed(2));

    const newRecord = new Methanol({
      date,
      vehicleNo: vehicleNo?.toUpperCase() || "",
      material: material?.toUpperCase() || "METHANOL",
      outsideWeight: outside,
      mtWeight: mt,
      difference,
      name: name?.toUpperCase() || "UNKNOWN"
    });

    await newRecord.save();
    res.json({ success: true, id: newRecord._id });
  } catch (err) {
    console.error("POST /api/methanol error:", err);
    res.status(400).json({ success: false, message: "Error saving record" });
  }
});

app.get("/api/methanol", async (req, res) => {
  try {
    const records = await Methanol.find().sort({ createdAt: -1 });
    res.json(records);
  } catch (err) {
    console.error("GET /api/methanol error:", err);
    res.status(500).json({ success: false, message: "Error fetching data" });
  }
});

app.put("/api/methanol/:id", async (req, res) => {
  try {
    let { date, vehicleNo, material, outsideWeight, mtWeight, name } = req.body;

    outsideWeight = parseFloat(outsideWeight);
    mtWeight = parseFloat(mtWeight);
    const difference = parseFloat((outsideWeight - mtWeight).toFixed(2));

    const updatedData = {
      date,
      vehicleNo,
      material,
      outsideWeight,
      mtWeight,
      difference: isNaN(difference) ? 0 : difference,
      name
    };

    await Methanol.findByIdAndUpdate(req.params.id, updatedData);
    res.json({ success: true });
  } catch (err) {
    console.error("PUT /api/methanol/:id error:", err);
    res.status(400).json({ success: false, message: "Error updating record" });
  }
});

// POST /api/reports/long-body
app.post('/api/reports/long-body', async (req, res) => {
  try {
    const {
      date,
      vehicle,
      material,
      outsideWeight,
      old80,
      new80,
      difference,
      name
    } = req.body;

    const report = new LongBodyReport({
      date,
      vehicle,
      material,
      outsideWeight,
      old80,
      new80,
      difference,
      name
    });

    await report.save();
    res.json({ success: true, message: 'Report saved successfully.' });
  } catch (err) {
    console.error('Error saving long body report:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
