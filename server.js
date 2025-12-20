// ========================== MAIN SERVER FILE ==========================
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
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("cloudinary").v2;
const { uploadUser, uploadUpdate } = require("./cloudinary");

// ========================== INITIALIZE ==========================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});
const PORT = process.env.PORT || 3000;

// ========================== MODELS ==========================
const User = require("./models/User");
const Update = require("./models/Update");
const ExcelData = require("./models/ExcelData");
const Message = require("./models/Message");
const WoodBill = require("./models/WoodBill");
const Methanol = require("./models/Methanol");
const LongBodyReport = require("./models/LongBodyReport");
const ShiftReport = require("./models/ShiftReport");
const Notification = require("./models/Notification");

// ========================== ROUTES ==========================
const shiftReportRoutes = require("./routes/shiftReportRoutes");
const updateRoutes = require("./routes/updateRoutes");
const shiftRoutes = require("./routes/shiftRoutes");
const longBodyRoutes = require("./routes/longBody");

// ========================== MIDDLEWARE ==========================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ========================== STATIC FILES ==========================
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
app.use("/bg", express.static(path.join(__dirname, "bg")));
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/Files", express.static(path.join(__dirname, "Files")));
app.use(express.static(path.join(__dirname, "public")));

// ========================== MULTER + CLOUDINARY ==========================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "updates",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});
const upload = multer({ storage });

const bgStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "bg")),
  filename: (req, file, cb) => cb(null, "background.jpg"),
});
const uploadBackground = multer({ storage: bgStorage });

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "uploads")),
  filename: (req, file, cb) => cb(null, Date.now() + ".xlsx"),
});
const uploadExcel = multer({ storage: excelStorage });

// ========================== MONGO DB CONNECTION ==========================
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/bab_system", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// ========================== WOOD BILL ==========================
app.post("/api/wood-bill", async (req, res) => {
  try {
    const bill = new WoodBill(req.body);
    await bill.save();
    res.json({ success: true, id: bill._id });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/wood-bill", async (req, res) => {
  try {
    const bills = await WoodBill.find().sort({ createdAt: -1 });
    res.json(bills);
  } catch {
    res.status(500).json({ success: false });
  }
});

app.put("/api/wood-bill/:id", async (req, res) => {
  try {
    await WoodBill.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true });
  } catch {
    res.status(500).json({ success: false });
  }
});

// ========================== SOCKET.IO CHAT ==========================
const onlineUsers = {};
io.on("connection", (socket) => {
  console.log("🔌 Connected:", socket.id);

  socket.on("join", async (userId) => {
    onlineUsers[userId] = socket.id;
    socket.userId = userId;

    const messages = await Message.find({
      $or: [{ from: userId }, { to: userId }],
    }).sort({ timestamp: 1 });

    const undelivered = messages.filter(
      (m) => m.to === userId && !m.delivered
    );
    if (undelivered.length) {
      const ids = undelivered.map((m) => m._id);
      await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { delivered: true, deliveredTimestamp: Date.now() } }
      );
    }
    socket.emit("loadMessages", messages);
    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  socket.on("chatMessage", async (data) => {
    const { from, to, message } = data;
    const newMsg = new Message({ from, to, message, delivered: false });
    await newMsg.save();

    if (onlineUsers[to]) {
      newMsg.delivered = true;
      newMsg.deliveredTimestamp = Date.now();
      await newMsg.save();
      io.to(onlineUsers[to]).emit("chatMessage", newMsg);
      socket.emit("messageDelivered", { messageId: newMsg._id });
    }
    socket.emit("chatMessage", newMsg);
  });

  socket.on("markAsSeen", async ({ messageIds, senderId }) => {
    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { seen: true, seenTimestamp: Date.now() } }
    );
    if (onlineUsers[senderId])
      io.to(onlineUsers[senderId]).emit("messageSeen", { messageIds });
  });

  socket.on("disconnect", () => {
    if (socket.userId) {
      delete onlineUsers[socket.userId];
      io.emit("onlineUsers", Object.keys(onlineUsers));
      console.log("❌ Disconnected:", socket.userId);
    }
  });
});

// ========================== TWILIO OTP ==========================
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
const otpStore = new Map();

// ========================== AUTH MIDDLEWARE ==========================
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ success: false });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch {
    res.status(403).json({ success: false });
  }
};

// ========================== MOUNT ROUTES ==========================
app.use("/api/shift-report", shiftRoutes);
app.use("/api/updates", updateRoutes);
app.use("/api/reports/shift", shiftReportRoutes);
app.use("/api/long-body", longBodyRoutes);

// ========================== USER MANAGEMENT ==========================
app.post("/api/create-user", uploadUser.single("profilePic"), async (req, res) => {
  try {
    const { userIdUpdate, username, userId, department, designation, mobile, email, role, password } = req.body;
    const profilePic = req.file ? req.file.path : "";

    if (userIdUpdate) {
      const user = await User.findById(userIdUpdate);
      if (!user) return res.json({ success: false, message: "User not found" });
      Object.assign(user, { username, department, designation, mobile, email, role });
      if (profilePic) user.profilePic = profilePic;
      if (password) user.password = await bcrypt.hash(password, 10);
      await user.save();
      return res.json({ success: true, message: "User updated", user });
    }

    const existing = await User.findOne({ userId });
    if (existing) return res.json({ success: false, message: "User ID exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ username, userId, department, designation, mobile, email, role, password: hashedPassword, profilePic });
    await newUser.save();
    res.json({ success: true, user: newUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

// ========================== LOGIN ==========================
app.post("/api/login", async (req, res) => {
  const { userId, password } = req.body;
  const user = await User.findOne({ userId });
  if (!user) return res.json({ success: false, message: "Invalid User ID" });
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.json({ success: false, message: "Incorrect password" });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  res.json({ success: true, token, user });
});

// ========================== REDIRECT PATH ==========================
app.get("/api/get-redirect-path", authMiddleware, async (req, res) => {
  const user = await User.findById(req.userId);
  let redirectPath = "/index.html";
  if (user.department === "Account") redirectPath = "/account.html";
  else if (user.department === "Administration") redirectPath = "/admin.html";
  else if (user.department === "Gate Entry") redirectPath = "/gate_entry.html";
  else if (user.department === "H R") redirectPath = "/hr.html";
  res.json({ success: true, redirectPath });
});

// ========================== START SERVER ==========================
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
