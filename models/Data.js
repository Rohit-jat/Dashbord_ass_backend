const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: ['analytics', 'reports', 'insights', 'metrics', 'other'],
    default: 'other'
  },
  value: {
    type: Number,
    required: [true, 'Value is required'],
    min: [0, 'Value cannot be negative']
  },
  unit: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  tags: [{
    type: String,
    trim: true
  }],
  metadata: {
    source: String,
    lastUpdated: Date,
    version: {
      type: String,
      default: '1.0.0'
    }
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for better query performance
dataSchema.index({ user: 1, category: 1 });
dataSchema.index({ category: 1, status: 1 });
dataSchema.index({ tags: 1 });
dataSchema.index({ createdAt: -1 });

// Virtual for formatted value with unit
dataSchema.virtual('formattedValue').get(function() {
  return this.unit ? `${this.value} ${this.unit}` : this.value.toString();
});

// Pre-save middleware to update lastUpdated metadata
dataSchema.pre('save', function(next) {
  this.metadata.lastUpdated = new Date();
  next();
});

// Static method to get data by category
dataSchema.statics.findByCategory = function(category) {
  return this.find({ category, status: 'active' });
};

// Static method to get data by user
dataSchema.statics.findByUser = function(userId) {
  return this.find({ user: userId }).populate('user', 'name email');
};

// Instance method to toggle status
dataSchema.methods.toggleStatus = function() {
  this.status = this.status === 'active' ? 'inactive' : 'active';
  return this.save();
};

// Instance method to add tag
dataSchema.methods.addTag = function(tag) {
  if (!this.tags.includes(tag)) {
    this.tags.push(tag);
  }
  return this.save();
};

// Instance method to remove tag
dataSchema.methods.removeTag = function(tag) {
  this.tags = this.tags.filter(t => t !== tag);
  return this.save();
};

module.exports = mongoose.model('Data', dataSchema);
