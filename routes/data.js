const express = require('express');
const { authenticateToken, requireOwnership } = require('../middleware/auth');
const Data = require('../models/Data');

const router = express.Router();

/**
 * @route   POST /api/data
 * @desc    Create new data record
 * @access  Private
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, value, unit, tags, isPublic } = req.body;
    
    // Validate required fields
    if (!title || !category || value === undefined) {
      return res.status(400).json({
        error: 'Title, category, and value are required'
      });
    }
    
    // Validate category
    const validCategories = ['analytics', 'reports', 'insights', 'metrics', 'other'];
    if (!validCategories.includes(category)) {
      return res.status(400).json({
        error: 'Invalid category'
      });
    }
    
    // Validate value
    if (typeof value !== 'number' || value < 0) {
      return res.status(400).json({
        error: 'Value must be a positive number'
      });
    }
    
    // Create new data record
    const newData = new Data({
      title: title.trim(),
      description: description ? description.trim() : '',
      category,
      value,
      unit: unit ? unit.trim() : '',
      tags: tags && Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [],
      isPublic: isPublic || false,
      user: req.user._id,
      metadata: {
        source: req.body.metadata?.source || 'manual',
        version: '1.0.0'
      }
    });
    
    await newData.save();
    
    // Populate user info
    await newData.populate('user', 'name email');
    
    res.status(201).json({
      success: true,
      message: 'Data record created successfully',
      data: newData
    });
  } catch (error) {
    console.error('Create data error:', error);
    
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
 * @route   GET /api/data
 * @desc    Fetch data records with filtering and pagination
 * @access  Private
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      status,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;
    
    // Build filter object
    const filter = { user: req.user._id };
    
    if (category) filter.category = category;
    if (status) filter.status = status;
    
    if (search) {
      const searchRegex = new RegExp(search.trim(), 'i');
      filter.$or = [
        { title: searchRegex },
        { description: searchRegex },
        { tags: searchRegex }
      ];
    }
    
    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Execute query with pagination
    const data = await Data.find(filter)
      .populate('user', 'name email')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));
    
    // Get total count for pagination
    const total = await Data.countDocuments(filter);
    
    res.json({
      success: true,
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get data error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/data/:id
 * @desc    Get single data record by ID
 * @access  Private
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const data = await Data.findById(req.params.id)
      .populate('user', 'name email');
    
    if (!data) {
      return res.status(404).json({
        error: 'Data record not found'
      });
    }
    
    // Check ownership
    if (data.user._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }
    
    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error('Get data by ID error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid data ID'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   PUT /api/data/:id
 * @desc    Update data record
 * @access  Private
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, category, value, unit, tags, status, isPublic } = req.body;
    
    // Find data record
    const data = await Data.findById(req.params.id);
    
    if (!data) {
      return res.status(404).json({
        error: 'Data record not found'
      });
    }
    
    // Check ownership
    if (data.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }
    
    // Build update object
    const updateFields = {};
    
    if (title !== undefined) updateFields.title = title.trim();
    if (description !== undefined) updateFields.description = description.trim();
    if (category !== undefined) {
      const validCategories = ['analytics', 'reports', 'insights', 'metrics', 'other'];
      if (!validCategories.includes(category)) {
        return res.status(400).json({
          error: 'Invalid category'
        });
      }
      updateFields.category = category;
    }
    if (value !== undefined) {
      if (typeof value !== 'number' || value < 0) {
        return res.status(400).json({
          error: 'Value must be a positive number'
        });
      }
      updateFields.value = value;
    }
    if (unit !== undefined) updateFields.unit = unit.trim();
    if (tags !== undefined) updateFields.tags = Array.isArray(tags) ? tags.filter(tag => tag.trim()) : [];
    if (status !== undefined) {
      const validStatuses = ['active', 'inactive', 'pending'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status'
        });
      }
      updateFields.status = status;
    }
    if (isPublic !== undefined) updateFields.isPublic = isPublic;
    
    // Update the record
    const updatedData = await Data.findByIdAndUpdate(
      req.params.id,
      { $set: updateFields },
      { new: true, runValidators: true }
    ).populate('user', 'name email');
    
    res.json({
      success: true,
      message: 'Data record updated successfully',
      data: updatedData
    });
  } catch (error) {
    console.error('Update data error:', error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Validation error',
        details: Object.values(error.errors).map(err => err.message)
      });
    }
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid data ID'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   DELETE /api/data/:id
 * @desc    Delete data record
 * @access  Private
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const data = await Data.findById(req.params.id);
    
    if (!data) {
      return res.status(404).json({
        error: 'Data record not found'
      });
    }
    
    // Check ownership
    if (data.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        error: 'Access denied'
      });
    }
    
    await Data.findByIdAndDelete(req.params.id);
    
    res.json({
      success: true,
      message: 'Data record deleted successfully'
    });
  } catch (error) {
    console.error('Delete data error:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        error: 'Invalid data ID'
      });
    }
    
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

/**
 * @route   GET /api/data/stats/summary
 * @desc    Get data statistics summary
 * @access  Private
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const stats = await Data.aggregate([
      { $match: { user: req.user._id } },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          totalValue: { $sum: '$value' },
          avgValue: { $avg: '$value' },
          categories: { $addToSet: '$category' },
          statuses: { $addToSet: '$status' }
        }
      }
    ]);
    
    // Get category breakdown
    const categoryStats = await Data.aggregate([
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
    
    const summary = stats[0] || {
      totalRecords: 0,
      totalValue: 0,
      avgValue: 0,
      categories: [],
      statuses: []
    };
    
    res.json({
      success: true,
      summary: {
        ...summary,
        categoryBreakdown: categoryStats
      }
    });
  } catch (error) {
    console.error('Get stats summary error:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

module.exports = router;
