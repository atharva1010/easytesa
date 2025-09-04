require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const path = require("path");
const fs = require("fs");
const ExcelJS = require("exceljs");
const http = require("http");
const { Server } = require("socket.io");
const twilio = require("twilio");
const multer = require("multer");
const streamifier = require("streamifier");
const { uploadUser, uploadUpdate } = require('./cloudinary');
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});
const PORT = process.env.PORT || 3000;

// Models
const User = require("./models/User");
const Update = require("./models/Update");
const ExcelData = require("./models/ExcelData");
const Message = require("./models/Message");
const WoodBill = require('./models/WoodBill');
const Methanol = require("./models/Methanol");
const LongBodyReport = require('./models/LongBodyReport');
const ShiftReport = require("./models/ShiftReport");
const Notification = require("./models/Notification");

// Routes
const shiftReportRoutes = require("./routes/shiftReportRoutes");
const updateRoutes = require("./routes/updateRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const longBodyRoutes = require('./routes/longBody');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/bg', express.static(path.join(__dirname, 'bg')));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/Files', express.static(path.join(__dirname, 'Files')));
app.use(express.static(path.join(__dirname, 'public')));

// Multer Setup
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'updates',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    public_id: (req, file) => Date.now() + '-' + file.originalname,
  },
});

const upload = multer({ storage });

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'bg')),
  filename: (req, file, cb) => cb(null, "background.jpg")
});
const uploadBackground = multer({ storage: bgStorage });

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => cb(null, Date.now() + ".xlsx")
});
const uploadExcel = multer({ storage: excelStorage });

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
    io.emit("onlineUsers", Object.keys(onlineUsers));
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

  socket.on("markAsSeen", async ({ messageIds, senderId }) => {
    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { seen: true, seenTimestamp: Date.now() } }
    );
    
    if (onlineUsers[senderId]) {
      io.to(onlineUsers[senderId]).emit("messageSeen", { 
        messageIds,
        seenBy: socket.userId 
      });
    }
  });

  socket.on("editMessage", async ({ messageId, newMessage }) => {
    const updated = await Message.findByIdAndUpdate(
      messageId,
      { $set: { message: newMessage, edited: true } },
      { new: true }
    );
    
    if (updated) {
      const recipients = [updated.from, updated.to].filter(id => id !== socket.userId);
      recipients.forEach(id => {
        if (onlineUsers[id]) {
          io.to(onlineUsers[id]).emit("messageEdited", {
            messageId,
            newMessage
          });
        }
      });
    }
  });

  socket.on("deleteMessage", async ({ messageId }) => {
    const deleted = await Message.findByIdAndDelete(messageId);
    if (deleted) {
      const recipients = [deleted.from, deleted.to].filter(id => id !== socket.userId);
      recipients.forEach(id => {
        if (onlineUsers[id]) {
          io.to(onlineUsers[id]).emit("messageDeleted", {
            messageId
          });
        }
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      io.emit("onlineUsers", Object.keys(onlineUsers));
      console.log("❌ User disconnected:", socket.userId);
    }
  });
});

// Twilio
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const otpStore = new Map();

// Auth Middleware
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

// Mount Routes
app.use("/api/shift-report", shiftRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/reports/shift", shiftReportRoutes);
app.use("/api/long-body", longBodyRoutes);

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

    const profilePic = req.file ? req.file.path : null;

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

app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.json(users);
  } catch (err) {
    console.error("Get Users Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch users" });
  }
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

app.post("/api/upload-excel", authMiddleware, uploadExcel.single("excelFile"), async (req, res) => {
  try {
    const { category } = req.body;
    const filePath = req.file.path;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.worksheets[0];
    const data = [];

    sheet.eachRow((row) => {
      const rowData = row.values.slice(1);
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
  try {
    const { userId } = req.body;
    console.log("👉 Received OTP request for userId:", userId);

    // Find user
    const user = await User.findOne({ userId });
    if (!user) {
      console.warn("⚠️ User not found for userId:", userId);
      return res.json({ success: false, message: "User ID not found" });
    }

    console.log("✅ User found:", user.username, "Mobile:", user.mobile);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore.set(userId, { otp, expires: Date.now() + 5 * 60 * 1000 });
    console.log(`🔑 OTP generated for ${user.username}:`, otp);

    // Debug environment variables
    console.log("📞 Twilio FROM number:", process.env.TWILIO_PHONE);
    console.log("📞 Sending TO number:", `+91${user.mobile}`);

    // Send OTP
    const message = await twilioClient.messages.create({
      body: `Hi ${user.username}, Your OTP for password reset is ${otp}. Do not share with anyone. Valid for 10 mins. support easyTESA`,
      from: process.env.TWILIO_PHONE,
      to: `+91${user.mobile}`
    });

    console.log("✅ Twilio message sent. SID:", message.sid);

    res.json({ success: true, message: "OTP sent to registered mobile" });

  } catch (err) {
    console.error("❌ Twilio Error:", err);
    res.json({
      success: false,
      message: "Failed to send OTP",
      error: err.message,   // extra detail
      code: err.code || null // Twilio error code if available
    });
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

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Update password error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// Message Endpoints
app.get("/api/messages/unread-count/:userId", async (req, res) => {
  try {
    const count = await Message.countDocuments({
      to: req.params.userId,
      seen: false
    });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, message: "Failed to get unread count" });
  }
});

app.get("/api/messages/:userId1/:userId2", async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { from: req.params.userId1, to: req.params.userId2 },
        { from: req.params.userId2, to: req.params.userId1 }
      ]
    }).sort({ timestamp: 1 });
    
    res.json({ success: true, messages });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post("/api/messages/mark-as-read", async (req, res) => {
  try {
    const { messageIds, senderId, receiverId } = req.body;
    
    const result = await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { seen: true, seenAt: new Date() } }
    );

    io.emit('messagesRead', { 
      senderId, 
      receiverId,
      modifiedCount: result.modifiedCount 
    });

    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark messages as read" });
  }
});

// Notification Endpoints
app.get("/api/notifications/unread-count/:userId", async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      recipient: req.params.userId,
      read: false
    });
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ error: "Failed to get unread count" });
  }
});

app.post('/api/notifications/mark-as-read', authMiddleware, async (req, res) => {
  try {
    const { notificationIds } = req.body;
    
    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        read: false
      },
      {
        $set: { 
          read: true,
          readAt: new Date()
        }
    });

    res.status(200).json({ 
      success: true,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

app.get('/api/unread-counts/:userId', authMiddleware, async (req, res) => {
  try {
    const messageCount = await Message.countDocuments({
      to: req.params.userId,
      seen: false
    });

    const notificationCount = await Notification.countDocuments({
      recipient: req.params.userId,
      read: false
    });

    res.json({ 
      success: true,
      messageCount,
      notificationCount
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to get unread counts" });
  }
});

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

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack);
  res.status(500).json({ 
    success: false, 
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Endpoint not found" });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
