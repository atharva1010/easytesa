require("dotenv").config(); const express= require("express"); const mongoose= require("mongoose"); const cors= require("cors"); const jwt= require("jsonwebtoken"); const bcrypt= require("bcryptjs"); const path= require("path"); const fs= require("fs"); const ExcelJS= require("exceljs"); const http= require("http"); const{ Server } = require("socket.io"); const twilio= require("twilio"); const multer= require("multer"); const streamifier= require("streamifier"); const{ uploadUser, uploadUpdate } = require('./cloudinary'); const cloudinary= require("cloudinary").v2; const{ CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express(); const server= http.createServer(app); const io= new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } }); const PORT= process.env.PORT || 3000;

// Models const User= require("./models/User"); const Update= require("./models/Update"); const ExcelData= require("./models/ExcelData"); const Message= require("./models/Message"); const WoodBill= require('./models/WoodBill'); const Methanol= require("./models/Methanol"); const LongBodyReport= require('./models/LongBodyReport'); const ShiftReport= require("./models/ShiftReport"); const Notification= require("./models/Notification");

// Routes const shiftReportRoutes= require("./routes/shiftReportRoutes"); const updateRoutes= require("./routes/updateRoutes"); const shiftRoutes= require("./routes/shiftRoutes"); const longBodyRoutes= require('./routes/longBody');

// Middleware app.use(cors()); app.use(express.json()); app.use(express.urlencoded({extended: true }));

// Static files app.use('/uploads',express.static(path.join(__dirname, 'uploads'))); app.use('/bg',express.static(path.join(__dirname, 'bg'))); app.use('/assets',express.static(path.join(__dirname, 'assets'))); app.use('/Files',express.static(path.join(__dirname, 'Files'))); app.use(express.static(path.join(__dirname,'public')));

// Multer Setup const storage= new CloudinaryStorage({ cloudinary, params: { folder: 'updates', allowed_formats: ['jpg', 'png', 'jpeg', 'webp'], public_id: (req, file) => Date.now() + '-' + file.originalname, }, });

const upload = multer({ storage });

const bgStorage = multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'bg')), filename: (req, file, cb) => cb(null, "background.jpg") }); const uploadBackground= multer({ storage: bgStorage });

const excelStorage = multer.diskStorage({ destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')), filename: (req, file, cb) => cb(null, Date.now() + ".xlsx") }); const uploadExcel= multer({ storage: excelStorage });

// DB Connection mongoose.connect(process.env.MONGODB_URI|| "mongodb://127.0.0.1:27017/bab_system", { useNewUrlParser: true, useUnifiedTopology: true }) .then(()=> console.log("✅ MongoDB Connected")) .catch(err=> console.error("❌ MongoDB connection error:", err));

// Socket.io Setup const onlineUsers= {}; io.on("connection",(socket) => { console.log("🔌 User connected:", socket.id);

// ✅ User join socket.on("join", async (userId) => { onlineUsers[userId] = socket.id; socket.userId = userId;

});

// ✅ New message send socket.on("chatMessage", async (data) => { const { from, to, message } = data; const newMsg = new Message({ from, to, message, delivered: false, deliveredTimestamp: null, seen: false, seenTimestamp: null }); await newMsg.save();

});

// ✅ Mark as Seen socket.on("markAsSeen", async ({ messageIds, senderId }) => { if (!messageIds || messageIds.length === 0) return;

});

// ✅ Edit Message socket.on("editMessage", async ({ messageId, newMessage }) => { const updated = await Message.findByIdAndUpdate( messageId, { $set: { message: newMessage, edited: true } }, { new: true } );

});

// ✅ Delete Message socket.on("deleteMessage", async ({ messageId }) => { const deleted = await Message.findByIdAndDelete(messageId); if (deleted) { const recipients = [deleted.from, deleted.to].filter(id => id !== socket.userId); recipients.forEach(id => { if (onlineUsers[id]) { io.to(onlineUsers[id]).emit("messageDeleted", { messageId }); } }); } });

// ✅ Disconnect socket.on("disconnect", () => { if (socket.userId) { delete onlineUsers[socket.userId]; io.emit("onlineUsers", Object.keys(onlineUsers)); console.log("❌ User disconnected:", socket.userId); } }); });

// Twilio const twilioClient= twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN); const otpStore= new Map();

// Auth Middleware const authMiddleware= (req, res, next) => { const token = req.headers.authorization?.split(" ")[1]; if (!token) return res.status(401).json({ success: false, message: "No token provided" });

try { const decoded = jwt.verify(token, process.env.JWT_SECRET); req.userId = decoded.id; next(); } catch (err) { return res.status(403).json({ success: false, message: "Invalid token" }); } };

// Mount Routes app.use("/api/shift-report",shiftRoutes); app.use("/api/updates",updateRoutes); app.use("/api/reports/shift",shiftReportRoutes); app.use("/api/long-body",longBodyRoutes);

// User Management Endpoints app.post("/api/create-user",uploadUser.single("profilePic"), async (req, res) => { try { const { userIdUpdate, username, userId, department, designation, mobile, email, role, password } = req.body;

} catch (err) { console.error("Create/Update User Error:", err); res.status(500).json({ success: false, message: "Server error" }); } });

app.get("/api/users", async (req, res) => { try { const users = await User.find().select("-password"); res.json(users); } catch (err) { console.error("Get Users Error:", err); res.status(500).json({ success: false, message: "Failed to fetch users" }); } });

// Auth Endpoints app.post("/api/login",async (req, res) => { const { userId, password } = req.body;

try { const user = await User.findOne({ userId }); if (!user) return res.json({ success: false, message: "Invalid User ID" });

} catch (err) { console.error("Login Error:", err); res.status(500).json({ success: false, message: "Server error" }); } });

app.get("/api/me", authMiddleware, async (req, res) => { const user = await User.findById(req.userId); if (!user) return res.json({ success: false }); res.json({ success: true, user }); });

// Department-based redirection endpoint - FIXED app.get("/api/get-redirect-path",authMiddleware, async (req, res) => { try { const user = await User.findById(req.userId); if (!user) { return res.status(404).json({ success: false, message: "User not found" }); }

} catch (err) { console.error("Redirect Error:", err); res.status(500).json({ success: false, message: "Server error" }); } });

// File Upload Endpoints app.post("/api/upload-background",uploadBackground.single("background"), (req, res) => { if (!req.file) return res.json({ success: false, message: "Upload failed" }); res.json({ success: true, message: "Background uploaded" }); });

app.post("/api/upload-excel", authMiddleware, uploadExcel.single("excelFile"), async (req, res) => { try { const { category } = req.body; const filePath = req.file.path;

} catch (err) { console.error("Excel Upload Error:", err); res.json({ success: false, message: "Upload failed" }); } });

app.get("/api/excel-data/:category", async (req, res) => { try { const { category } = req.params; const record = await ExcelData.findOne({ category }).sort({ uploadedAt: -1 }); if (!record) return res.json({ success: false, message: "No data found" });

} catch (err) { res.json({ success: false, message: "Failed to fetch data" }); } });

// ===================== SEND OTP ===================== app.post("/api/send-otp",async (req, res) => { try { const { userId } = req.body; console.log("👉 OTP request for userId:", userId);

} catch (err) { console.error("❌ Twilio Error:", err); res.json({ success: false, message: "Failed to send OTP", error: err.message }); } });

// ===================== VERIFY OTP ===================== app.post("/api/verify-otp",(req, res) => { const { userId, otp } = req.body; const stored = otpStore.get(userId);

console.log("👉 Verify OTP - User:", userId, "Entered:", otp, "Stored:", stored);

if (!stored) { return res.json({ success: false, message: "OTP not found" }); }

if (String(stored.otp) !== String(otp) || stored.expires < Date.now()) { return res.json({ success: false, message: "Invalid or expired OTP" }); }

return res.json({ success: true, message: "OTP verified successfully" }); });

// ===================== RESET PASSWORD VIA OTP ===================== app.post("/api/reset-password",async (req, res) => { try { const { userId, otp, newPassword } = req.body; const stored = otpStore.get(userId);

} catch (err) { console.error("Reset password error:", err); res.status(500).json({ success: false, message: "Internal server error" }); } });

// ===================== UPDATE PASSWORD WITHOUT OTP (ADMIN/USER) ===================== app.post("/api/update-password",async (req, res) => { const { userId, newPassword } = req.body;

try { const user = await User.findOne({ userId }); if (!user) return res.json({ success: false, message: "User not found" });

} catch (err) { console.error("Update Password Error:", err); res.status(500).json({ success: false, message: "Server error" }); } });

// Delete User by ID app.delete("/api/delete-user/:id",async (req, res) => { try { const { id } = req.params; const deletedUser = await User.findByIdAndDelete(id);

} catch (err) { console.error("Delete User Error:", err); res.status(500).json({ success: false, message: "Server error" }); } });

// Message Endpoints app.get("/api/messages/unread-count/:userId",async (req, res) => { try { const count = await Message.countDocuments({ to: req.params.userId, seen: false }); res.json({ success: true, count }); } catch (err) { res.status(500).json({ success: false, message: "Failed to get unread count" }); } });

app.get("/api/messages/:userId1/:userId2", async (req, res) => { try { const messages = await Message.find({ $or: [
        { from: req.params.userId1, to: req.params.userId2 },
        { from: req.params.userId2, to: req.params.userId1 }
      ] }).sort({ timestamp: 1 });

} catch (err) { res.status(500).json({ success: false, message: "Server error" }); } });

app.post("/api/messages/mark-as-read", async (req, res) => { try { const { messageIds, senderId, receiverId } = req.body;

} catch (error) { res.status(500).json({ error: "Failed to mark messages as read" }); } });

// Notification Endpoints app.get("/api/notifications/unread-count/:userId",async (req, res) => { try { const count = await Notification.countDocuments({ recipient: req.params.userId, read: false }); res.json({ success: true, count }); } catch (error) { res.status(500).json({ error: "Failed to get unread count" }); } });

app.post('/api/notifications/mark-as-read', authMiddleware, async (req, res) => { try { const { notificationIds } = req.body;

} catch (error) { res.status(500).json({ error: "Failed to mark notifications as read" }); } });

app.get('/api/unread-counts/:userId', authMiddleware, async (req, res) => { try { const messageCount = await Message.countDocuments({ to: req.params.userId, seen: false });

} catch (error) { res.status(500).json({ error: "Failed to get unread counts" }); } });

// Start Server server.listen(PORT,() => { console.log(🚀 Server running on port ${PORT}); });
