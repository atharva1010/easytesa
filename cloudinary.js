
// cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'easyGateUsers', // folder name in your cloudinary account
    allowed_formats: ['jpg', 'png', 'jpeg'],
    public_id: (req, file) => `user_${Date.now()}`
  }
});

const uploadUser = multer({ storage });

module.exports = { uploadUser };
