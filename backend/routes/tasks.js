// routes/tasks.js
const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const Task = require('../models/Task');

// Simple in-memory cache for development
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cacheMiddleware = (duration) => {
  return (req, res, next) => {
    const key = req.originalUrl;
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < duration * 1000) {
      return res.json(cached.data);
    }
    
    res.sendResponse = res.json;
    res.json = (body) => {
      cache.set(key, {
        data: body,
        timestamp: Date.now()
      });
      res.sendResponse(body);
    };
    
    next();
  };
};

const invalidateCache = () => {
  cache.clear();
};

// GET all tasks
router.get('/', cacheMiddleware(300), async (req, res) => {
  try {
    const tasks = await Task.findAll({
      order: [['created_at', 'DESC']]
    });
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// GET single task
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// POST create new task
router.post('/', async (req, res) => {
  try {
    const { title, description, status = 'todo' } = req.body;
    
    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    
    const task = await Task.create({
      title: title.trim(),
      description: description?.trim() || '',
      status
    });
    
    invalidateCache();
    res.status(201).json(task);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// PUT update task
router.put('/:id', async (req, res) => {
  try {
    const { title, description, status } = req.body;
    const task = await Task.findByPk(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const updateData = {};
    if (title !== undefined) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (status !== undefined) updateData.status = status;
    
    await task.update(updateData);
    invalidateCache();
    
    res.json(task);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// DELETE task
router.delete('/:id', async (req, res) => {
  try {
    const task = await Task.findByPk(req.params.id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    await task.destroy();
    invalidateCache();
    
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

// POST search tasks
router.post('/search', async (req, res) => {
  try {
    const { query, limit = 5 } = req.body;
    
    if (!query || !query.trim()) {
      return res.json([]);
    }
    
    const searchTerm = query.trim();
    const tasks = await Task.findAll({
      where: {
        [Op.or]: [
          { title: { [Op.iLike]: `%${searchTerm}%` } },
          { description: { [Op.iLike]: `%${searchTerm}%` } }
        ]
      },
      limit: parseInt(limit),
      order: [['updated_at', 'DESC']]
    });
    
    // Add simple relevance scoring
    const resultsWithRank = tasks.map(task => {
      let rank = 0;
      const titleMatch = task.title.toLowerCase().includes(searchTerm.toLowerCase());
      const descMatch = task.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      if (titleMatch) rank += 0.8;
      if (descMatch) rank += 0.4;
      
      return {
        ...task.toJSON(),
        rank
      };
    });
    
    resultsWithRank.sort((a, b) => b.rank - a.rank);
    res.json(resultsWithRank);
  } catch (error) {
    console.error('Error searching tasks:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      message: error.message 
    });
  }
});

module.exports = router;