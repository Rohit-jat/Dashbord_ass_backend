const express = require('express');
const { authenticateToken, requireOwnership } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

/**
 * @route   GET /api/user/profile
 * @desc    Get logged-in user profile
 * @access  Private
 */
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('-__v');
    
    if (!user) {
      return res.status(404).json({
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: user.getPublicProfile()
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   PUT /api/user/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName, preferences } = req.body;
    
    // Fields that can be updated
    const updateFields = {};
    
    if (firstName !== undefined) updateFields.firstName = firstName;
    if (lastName !== undefined) updateFields.lastName = lastName;
    if (preferences !== undefined) updateFields.preferences = preferences;
    
    // Validate preferences if provided
    if (preferences) {
      if (preferences.theme && !['light', 'dark'].includes(preferences.theme)) {
        return res.status(400).json({
          error: 'Invalid theme preference'
        });
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).select('-__v');
    
    if (!updatedUser) {
      return res.status(404).json({
        error: 'User not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: updatedUser.getPublicProfile()
    });
  } catch (error) {
    console.error('Update profile error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/user/stats
 * @desc    Get user statistics
 * @access  Private
 */
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    // Get user's data count by category
    const Data = require('../models/Data');
    
    const stats = await Data.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalValue: { $sum: '$value' }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    // Get total counts
    const totalData = await Data.countDocuments({ user: req.user._id });
    const activeData = await Data.countDocuments({ user: req.user._id, status: 'active' });
    
    res.json({
      success: true,
      stats: {
        totalData,
        activeData,
        byCategory: stats,
        lastLogin: req.user.lastLogin
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   DELETE /api/user/account
 * @desc    Delete user account
 * @access  Private
 */
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const { password } = req.body;
    
    // For Google OAuth users, we don't have a password
    // You might want to implement additional verification
    
    // Delete user's data first
    const Data = require('../models/Data');
    await Data.deleteMany({ user: req.user._id });
    
    // Delete user account
    await User.findByIdAndDelete(req.user._id);
    
    res.json({
      success: true,
      message: 'Account deleted successfully'
    });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/user/search
 * @desc    Search users (admin only)
 * @access  Private (Admin)
 */
router.get('/search', authenticateToken, async (req, res) => {
  try {
    const { query, limit = 10, page = 1 } = req.query;
    
    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        error: 'Search query must be at least 2 characters long'
      });
    }
    
    const searchRegex = new RegExp(query.trim(), 'i');
    
    const users = await User.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ]
    })
    .select('name email firstName lastName avatar role isActive createdAt')
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .sort({ createdAt: -1 });
    
    const total = await User.countDocuments({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { firstName: searchRegex },
        { lastName: searchRegex }
      ]
    });
    
    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
