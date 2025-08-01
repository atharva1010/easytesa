const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient of the notification
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true // Index for faster queries
  },

  // Notification content
  content: {
    type: String,
    required: true
  },

  // Notification type (for categorization)
  type: {
    type: String,
    enum: ['message', 'system', 'alert', 'update'],
    default: 'system'
  },

  // Read status - critical for unread count tracking
  read: {
    type: Boolean,
    default: false,
    index: true // Important for counting unread notifications
  },

  // When the notification was read
  readAt: {
    type: Date
  },

  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // Reference to related entity (e.g., message, post, etc.)
  relatedEntity: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedEntityModel'
  },

  // Dynamic reference to different models
  relatedEntityModel: {
    type: String,
    enum: ['Message', 'Update', 'Post']
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index for frequently used queries
notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });

// Virtual property to check if notification is unread
notificationSchema.virtual('isUnread').get(function() {
  return !this.read;
});

// Pre-save hook to update readAt when read status changes
notificationSchema.pre('save', function(next) {
  if (this.isModified('read') && this.read) {
    this.readAt = new Date();
  }
  next();
});

// Static method to mark notifications as read
notificationSchema.statics.markAsRead = async function(notificationIds, recipientId) {
  return this.updateMany(
    {
      _id: { $in: notificationIds },
      recipient: recipientId,
      read: false
    },
    {
      $set: {
        read: true,
        readAt: new Date()
      }
    }
  );
};

// Static method to get unread count for a user
notificationSchema.statics.getUnreadCount = function(recipientId) {
  return this.countDocuments({
    recipient: recipientId,
    read: false
  });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
