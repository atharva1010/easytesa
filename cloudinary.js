// cloudinary.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary configuration
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Upload for user profile images
const userStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'easyGateUsers', // folder for user profile images
    allowed_formats: ['jpg', 'png', 'jpeg'],
    public_id: (req, file) => `user_${Date.now()}`
  }
});
const uploadUser = multer({ storage: userStorage });

// Upload for update post images
const updateStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'easyGateUpdates', // folder for post/update images
    allowed_formats: ['jpg', 'png', 'jpeg'],
    public_id: (req, file) => `update_${Date.now()}`
  }
});
const uploadUpdate = multer({ storage: updateStorage });

module.exports = { uploadUser, uploadUpdate };
