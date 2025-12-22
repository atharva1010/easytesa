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

  // ✅ User join
  socket.on("join", async (userId) => {
    onlineUsers[userId] = socket.id;
    socket.userId = userId;

    // Load all messages involving this user
    const messages = await Message.find({
      $or: [{ from: userId }, { to: userId }]
    }).sort({ timestamp: 1 });

    // Update undelivered messages to delivered (for offline → online case)
    const undelivered = messages.filter(msg => msg.to === userId && !msg.delivered);
    if (undelivered.length > 0) {
      const ids = undelivered.map(m => m._id);
      await Message.updateMany(
        { _id: { $in: ids } },
        { $set: { delivered: true, deliveredTimestamp: Date.now() } }
      );

      // Notify sender(s) that messages are delivered
      undelivered.forEach(msg => {
        if (onlineUsers[msg.from]) {
          io.to(onlineUsers[msg.from]).emit("messageDelivered", {
            messageId: msg._id,
            delivered: true
          });
        }
      });
    }

    socket.emit("loadMessages", messages);
    io.emit("onlineUsers", Object.keys(onlineUsers));
  });

  // ✅ New message send
  socket.on("chatMessage", async (data) => {
    const { from, to, message } = data;
    const newMsg = new Message({
      from,
      to,
      message,
      delivered: false,
      deliveredTimestamp: null,
      seen: false,
      seenTimestamp: null
    });
    await newMsg.save();

    // अगर receiver online है → delivered कर दो
    if (onlineUsers[to]) {
      newMsg.delivered = true;
      newMsg.deliveredTimestamp = Date.now();
      await newMsg.save();

      io.to(onlineUsers[to]).emit("chatMessage", newMsg);

      // sender को बताओ कि delivered हो गया
      socket.emit("messageDelivered", {
        messageId: newMsg._id,
        delivered: true
      });
    }

    // sender को भेजो (offline case में भी दिखेगा)
    socket.emit("chatMessage", newMsg);
  });

  // ✅ Mark as Seen
  socket.on("markAsSeen", async ({ messageIds, senderId }) => {
    if (!messageIds || messageIds.length === 0) return;

    await Message.updateMany(
      { _id: { $in: messageIds } },
      { $set: { seen: true, seenTimestamp: Date.now() } }
    );

    // sender को notify करो कि message seen हो गए
    if (onlineUsers[senderId]) {
      io.to(onlineUsers[senderId]).emit("messageSeen", {
        messageIds,
        seenBy: socket.userId
      });
    }
  });

  // ✅ Edit Message
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

  // ✅ Delete Message
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

  // ✅ Disconnect
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

// ===================== WOOD BILL ROUTES =====================

// GET all wood bills
app.get("/api/wood-bill", async (req, res) => {
  try {
    const woodBills = await WoodBill.find().sort({ sapDate: -1 });
    res.json(woodBills);
  } catch (err) {
    console.error("Get wood bills error:", err);
    res.status(500).json({ error: "Failed to fetch wood bills" });
  }
});

// POST create new wood bill
app.post("/api/wood-bill", async (req, res) => {
  try {
    const woodBillData = req.body;
    
    // Auto-fill receiver based on plant
    if (woodBillData.plant === 'C2' || woodBillData.plant === 'C34A') {
      woodBillData.receiverName = "SECURITY";
      woodBillData.receiverStatus = "Received by Security";
      woodBillData.isReceived = true;
      woodBillData.receivedAt = new Date();
    } else if (woodBillData.plant === 'C3') {
      woodBillData.receiverStatus = "Pending by Receiver";
      woodBillData.isReceived = false;
    }
    
    const newWoodBill = new WoodBill(woodBillData);
    await newWoodBill.save();
    
    res.status(201).json({
      success: true,
      id: newWoodBill._id,
      message: "Wood bill saved successfully"
    });
  } catch (error) {
    console.error("Create wood bill error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to save wood bill" 
    });
  }
});

// PUT update wood bill
app.put("/api/wood-bill/:id", async (req, res) => {
  try {
    const updatedWoodBill = await WoodBill.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    
    if (!updatedWoodBill) {
      return res.status(404).json({ 
        success: false, 
        message: "Wood bill not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Updated successfully" 
    });
  } catch (error) {
    console.error("Update wood bill error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to update wood bill" 
    });
  }
});

// PUT receive wood bill (for C3 bills)
app.put("/api/wood-bill/:id/receive", async (req, res) => {
  try {
    const { receivedBy } = req.body;
    
    const updatedWoodBill = await WoodBill.findByIdAndUpdate(
      req.params.id,
      { 
        receiverName: receivedBy,
        receiverStatus: "Received",
        receivedAt: new Date(),
        isReceived: true
      },
      { new: true }
    );
    
    if (!updatedWoodBill) {
      return res.status(404).json({ 
        success: false, 
        message: "Wood bill not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Wood bill received successfully",
      data: updatedWoodBill
    });
  } catch (error) {
    console.error("Receive wood bill error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to receive wood bill" 
    });
  }
});

// GET pending C3 bills for receiver panel
app.get("/api/wood-bill/pending/c3", async (req, res) => {
  try {
    const pendingBills = await WoodBill.find({ 
      plant: 'C3',
      receiverStatus: "Pending by Receiver"
    }).sort({ sapDate: -1 });
    
    res.json(pendingBills);
  } catch (err) {
    console.error("Get pending C3 bills error:", err);
    res.status(500).json({ error: "Failed to fetch pending bills" });
  }
});

// GET all received bills for receiver panel
app.get("/api/wood-bill/received", async (req, res) => {
  try {
    const receivedBills = await WoodBill.find({ 
      receiverStatus: "Received"
    }).sort({ receivedAt: -1 });
    
    res.json(receivedBills);
  } catch (err) {
    console.error("Get received bills error:", err);
    res.status(500).json({ error: "Failed to fetch received bills" });
  }
});

// DELETE wood bill
app.delete("/api/wood-bill/:id", async (req, res) => {
  try {
    const deletedWoodBill = await WoodBill.findByIdAndDelete(req.params.id);
    
    if (!deletedWoodBill) {
      return res.status(404).json({ 
        success: false, 
        message: "Wood bill not found" 
      });
    }
    
    res.json({ 
      success: true, 
      message: "Wood bill deleted successfully" 
    });
  } catch (error) {
    console.error("Delete wood bill error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to delete wood bill" 
    });
  }
});

// ===================== END WOOD BILL ROUTES =====================

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

    const profilePic = req.file ? req.file.path : "";

    // ✅ If userIdUpdate exists → Update user
    if (userIdUpdate) {
      const user = await User.findById(userIdUpdate);
      if (!user) return res.json({ success: false, message: "User not found" });

      user.username = username;
      user.department = department;
      user.designation = designation;
      user.mobile = mobile;
      user.email = email;
      user.role = role || "user";

      if (profilePic) user.profilePic = profilePic;
      if (password) user.password = await bcrypt.hash(password, 10);

      await user.save();
      return res.json({ success: true, message: "User updated successfully", user });
    }

    // ✅ Check if userId already exists
    const existing = await User.findOne({ userId });
    if (existing) {
      return res.json({ success: false, message: "User ID already exists" });
    }

    // ✅ Check if email or mobile already exists
    const existingEmail = await User.findOne({ email });
    if (existingEmail) {
      return res.json({ success: false, message: "Email already exists" });
    }
    const existingMobile = await User.findOne({ mobile });
    if (existingMobile) {
      return res.json({ success: false, message: "Mobile already exists" });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create new user
    const newUser = new User({
      username,
      userId,
      department,
      designation,
      mobile,
      email,
      role: role || "user",
      password: hashedPassword,
      profilePic: profilePic
    });

    await newUser.save();
    res.json({ success: true, message: "User created successfully", user: newUser });

  } catch (err) {
    console.error("Create/Update User Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, 'public', `${page}.html`);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      next(); // Agar file exist nahi karti → next middleware (404)
    } else {
      res.sendFile(filePath);
    }
  });
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
      role: user.role,
      department: user.department // Add department to response
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

// Department-based redirection endpoint - FIXED
app.get("/api/get-redirect-path", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    let redirectPath = "";
    
    // Department-based redirection logic - FIXED
    // Debugging ke liye console log add kiya
    console.log("User department:", user.department);
    
    // Department ke basis pe redirect karega
    if (user.department === "Account") {
      redirectPath = "/account.html";
    } 
    else if (user.department === "Administration") {
      redirectPath = "/admin.html";
    }
    else if (user.department === "Gate Entry") {
      redirectPath = "/gate_entry.html";
    }
    else if (user.department === "H R") {
      redirectPath = "/hr.html";
    }
    else {
      // Agar koi page nahi hai to index.html pe redirect karo
      redirectPath = "/index.html";
    }

    console.log("Redirecting to:", redirectPath);
    res.json({ success: true, redirectPath });
  } catch (err) {
    console.error("Redirect Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
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

// ===================== SEND OTP =====================
app.post("/api/send-otp", async (req, res) => {
  try {
    const { userId } = req.body;
    console.log("👉 OTP request for userId:", userId);

    const user = await User.findOne({ userId }).lean();
    if (!user) {
      return res.json({ success: false, message: "User ID not found" });
    }

    console.log("✅ User found:", user.username, "| Mobile:", user.mobile);

    if (!user.mobile) {
      return res.json({ success: false, message: "Mobile number not registered for this user" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000);
    otpStore.set(userId, { otp, expires: Date.now() + 10 * 60 * 1000 }); // 10 mins expiry

    const phone = `+91${user.mobile}`;
    console.log(`📞 Sending OTP to ${user.username} at ${phone}, OTP = ${otp}`);

    const message = await twilioClient.messages.create({
      body: `Hi ${user.username}, Your OTP for password reset is ${otp}. Do not share with anyone. Valid for 10 mins. support easyTESA`,
      from: process.env.TWILIO_PHONE,
      to: phone
    });

    console.log("✅ OTP sent successfully. SID:", message.sid);
    res.json({ success: true, message: "OTP sent to registered mobile" });

  } catch (err) {
    console.error("❌ Twilio Error:", err);
    res.json({ success: false, message: "Failed to send OTP", error: err.message });
  }
});

// ===================== VERIFY OTP =====================
app.post("/api/verify-otp", (req, res) => {
  const { userId, otp } = req.body;
  const stored = otpStore.get(userId);

  console.log("👉 Verify OTP - User:", userId, "Entered:", otp, "Stored:", stored);

  if (!stored) {
    return res.json({ success: false, message: "OTP not found" });
  }

  if (String(stored.otp) !== String(otp) || stored.expires < Date.now()) {
    return res.json({ success: false, message: "Invalid or expired OTP" });
  }

  return res.json({ success: true, message: "OTP verified successfully" });
});

// ===================== RESET PASSWORD VIA OTP =====================
app.post("/api/reset-password", async (req, res) => {
  try {
    const { userId, otp, newPassword } = req.body;
    const stored = otpStore.get(userId);

    if (!stored || String(stored.otp) !== String(otp) || stored.expires < Date.now()) {
      return res.json({ success: false, message: "Invalid or expired OTP" });
    }

    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, message: "User not found" });

    // ✅ Always hash password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    console.log("✅ Password reset successful", {
      userId: user.userId,
      enteredPassword: newPassword,
      storedHash: hashedPassword
    });

    otpStore.delete(userId);
    res.json({ success: true, message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

// ===================== UPDATE PASSWORD WITHOUT OTP (ADMIN/USER) =====================
app.post("/api/update-password", async (req, res) => {
  const { userId, newPassword } = req.body;

  try {
    const user = await User.findOne({ userId });
    if (!user) return res.json({ success: false, message: "User not found" });

    const hashedPassword = await bcrypt.hash(newPassword, 10); // ✅ Always hash
    user.password = hashedPassword;
    await user.save();

    console.log("✅ Password updated & hashed for:", user.username);

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("Update Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Delete User by ID
app.delete("/api/delete-user/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deletedUser = await User.findByIdAndDelete(id);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({ success: true, message: "User deleted successfully" });
  } catch (err) {
    console.error("Delete User Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
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

// 404 Handler for undefined routes
app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

// Start Server
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
