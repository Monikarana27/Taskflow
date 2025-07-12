const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { Redis } = require('@upstash/redis');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - UPDATED CORS configuration
app.use(cors({
  origin: [
    'https://taskflow-1-oq08.onrender.com',  // Your frontend URL
    'http://localhost:3000'  // For local development
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id']
}));
app.use(express.json());

// PostgreSQL connection
let pool;

if (process.env.DATABASE_URL) {
  console.log('🔄 Using DATABASE_URL for PostgreSQL connection');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  });
} else {
  console.log('🔄 Using individual environment variables for PostgreSQL');
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'taskdb',
    user: process.env.DB_USER || 'taskuser',
    password: process.env.DB_PASSWORD || 'taskpass',
  });
}

// Upstash Redis connection
const redisClient = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// Initialize Redis connection
const initRedis = async () => {
  try {
    await redisClient.ping();
    console.log('✅ Connected to Upstash Redis');
  } catch (error) {
    console.error('Failed to connect to Upstash Redis:', error);
  }
};

// Cache configuration
const CACHE_TTL = 300; // 5 minutes in seconds
const CACHE_KEYS = {
  USER_TASKS: 'user_tasks:',
  TASK_BY_ID: 'task:',
  USER_SESSION: 'session:'
};

// Helper function to get cache key for user tasks
const getUserTasksCacheKey = (userId) => `${CACHE_KEYS.USER_TASKS}${userId}`;

// Helper function to get cache key for task by ID
const getTaskCacheKey = (id) => `${CACHE_KEYS.TASK_BY_ID}${id}`;

// Helper function to get user session cache key
const getUserSessionCacheKey = (userId) => `${CACHE_KEYS.USER_SESSION}${userId}`;

// Cache invalidation helper - only for specific user
const invalidateUserTaskCaches = async (userId) => {
  try {
    const userTasksKey = getUserTasksCacheKey(userId);
    await redisClient.del(userTasksKey);
    console.log(`🗑️ User ${userId} task cache invalidated`);
  } catch (error) {
    console.error('Error invalidating user cache:', error);
  }
};

// Middleware to handle user sessions
const handleUserSession = async (req, res, next) => {
  try {
    let userId = req.headers['x-user-id'];
    
    if (!userId) {
      // Generate new user ID if not provided
      userId = uuidv4();
      res.setHeader('X-User-Id', userId);
    }
    
    // Store user session in Redis (optional - for tracking active users)
    const sessionKey = getUserSessionCacheKey(userId);
    await redisClient.setex(sessionKey, 3600, { // 1 hour session
      lastActivity: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    
    req.userId = userId;
    next();
  } catch (error) {
    console.error('Error handling user session:', error);
    // Continue without session if Redis fails
    req.userId = req.headers['x-user-id'] || uuidv4();
    next();
  }
};

// Database connection test
const testDbConnection = async () => {
  try {
    await pool.query('SELECT NOW()');
    console.log('✅ Connected to PostgreSQL');
  } catch (error) {
    console.error('❌ PostgreSQL connection error:', error);
  }
};

// UPDATED: Initialize database with user_id column
const initializeDatabase = async () => {
  try {
    // Check if the table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tasks'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('📋 Tasks table does not exist, creating...');
      
      // Create tasks table with user_id column
      await pool.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          priority VARCHAR(20) DEFAULT 'medium',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      // Create index on user_id for better performance
      await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)
      `);
      
      console.log('✅ Database table created successfully');
    } else {
      console.log('✅ Tasks table already exists');
      
      // Check if user_id column exists, if not add it
      try {
        const userIdColumnExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'tasks' 
            AND column_name = 'user_id'
          );
        `);
        
        if (!userIdColumnExists.rows[0].exists) {
          console.log('📋 Adding user_id column to tasks table...');
          await pool.query(`
            ALTER TABLE tasks ADD COLUMN user_id VARCHAR(255) NOT NULL DEFAULT 'legacy_user'
          `);
          
          // Create index on user_id
          await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id)
          `);
          
          console.log('✅ User_id column added successfully');
        }
      } catch (alterError) {
        console.error('❌ Error adding user_id column:', alterError.message);
      }
      
      // Check if priority column exists, if not add it
      try {
        const priorityColumnExists = await pool.query(`
          SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_schema = 'public' 
            AND table_name = 'tasks' 
            AND column_name = 'priority'
          );
        `);
        
        if (!priorityColumnExists.rows[0].exists) {
          console.log('📋 Adding priority column to tasks table...');
          await pool.query(`
            ALTER TABLE tasks ADD COLUMN priority VARCHAR(20) DEFAULT 'medium'
          `);
          console.log('✅ Priority column added successfully');
        }
      } catch (alterError) {
        console.error('❌ Error adding priority column:', alterError.message);
      }
    }
    
  } catch (error) {
    console.error('❌ Error during database initialization:', error.message);
  }
};

// Routes

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Task Management API',
    version: '2.0.0',
    features: ['User Sessions', 'Task Isolation', 'Caching'],
    endpoints: {
      health: '/health',
      tasks: '/api/tasks',
      search: '/api/tasks/search'
    }
  });
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    await redisClient.ping();
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'connected'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'unhealthy', 
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// UPDATED: Search tasks for specific user (MOVED TO FIRST POSITION)
app.get('/api/tasks/search', handleUserSession, async (req, res) => {
  const { q: query, status, priority, limit = 10 } = req.query;
  const userId = req.userId;
  
  try {
    let searchQuery = `
      SELECT id, title, description, status, priority, created_at, updated_at
      FROM tasks 
      WHERE user_id = $1
    `;
    const values = [userId];
    let paramCount = 2;
    
    if (query && query.trim()) {
      searchQuery += ` AND (LOWER(title) LIKE LOWER($${paramCount}) OR LOWER(description) LIKE LOWER($${paramCount}))`;
      values.push(`%${query.trim()}%`);
      paramCount++;
    }
    
    if (status && status !== 'all') {
      searchQuery += ` AND status = $${paramCount}`;
      values.push(status);
      paramCount++;
    }
    
    if (priority && priority !== 'all') {
      searchQuery += ` AND priority = $${paramCount}`;
      values.push(priority);
      paramCount++;
    }
    
    searchQuery += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
    values.push(parseInt(limit));
    
    const result = await pool.query(searchQuery, values);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching tasks:', error);
    res.status(500).json({ error: 'Failed to search tasks' });
  }
});

// UPDATED: Get all tasks for specific user (MOVED TO SECOND POSITION)
app.get('/api/tasks', handleUserSession, async (req, res) => {
  try {
    const userId = req.userId;
    const cacheKey = getUserTasksCacheKey(userId);
    
    // Try to get from cache first
    const cachedTasks = await redisClient.get(cacheKey);
    
    if (cachedTasks) {
      console.log(`📋 Serving tasks for user ${userId} from Redis cache`);
      return res.json(cachedTasks);
    }
    
    // If not in cache, get from database
    console.log(`🔍 Fetching tasks for user ${userId} from database`);
    const result = await pool.query(`
      SELECT id, title, description, status, priority, created_at, updated_at 
      FROM tasks 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    const tasks = result.rows;
    
    // Cache the result
    await redisClient.setex(cacheKey, CACHE_TTL, tasks);
    console.log(`💾 Tasks for user ${userId} cached in Redis`);
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// UPDATED: Get single task by ID (with user ownership check) (THIRD POSITION)
app.get('/api/tasks/:id', handleUserSession, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  
  try {
    const result = await pool.query(`
      SELECT id, title, description, status, priority, created_at, updated_at 
      FROM tasks 
      WHERE id = $1 AND user_id = $2
    `, [id, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// UPDATED: Create new task with user association
app.post('/api/tasks', handleUserSession, async (req, res) => {
  const { title, description, status = 'pending', priority = 'medium' } = req.body;
  const userId = req.userId;
  
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  
  try {
    const result = await pool.query(`
      INSERT INTO tasks (user_id, title, description, status, priority, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      RETURNING id, title, description, status, priority, created_at, updated_at
    `, [userId, title.trim(), description?.trim() || '', status, priority]);
    
    const newTask = result.rows[0];
    
    // Invalidate only this user's cache
    await invalidateUserTaskCaches(userId);
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// UPDATED: Update task with user ownership check
app.put('/api/tasks/:id', handleUserSession, async (req, res) => {
  const { id } = req.params;
  const { title, description, status, priority } = req.body;
  const userId = req.userId;
  
  try {
    // Build dynamic update query
    const updates = [];
    const values = [userId, id]; // user_id first, then id
    let paramCount = 3; // Start from 3 since we have user_id and id
    
    if (title !== undefined) {
      updates.push(`title = $${paramCount}`);
      values.push(title.trim());
      paramCount++;
    }
    
    if (description !== undefined) {
      updates.push(`description = $${paramCount}`);
      values.push(description?.trim() || '');
      paramCount++;
    }
    
    if (status !== undefined) {
      updates.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }
    
    if (priority !== undefined) {
      updates.push(`priority = $${paramCount}`);
      values.push(priority);
      paramCount++;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    
    const query = `
      UPDATE tasks 
      SET ${updates.join(', ')} 
      WHERE user_id = $1 AND id = $2
      RETURNING id, title, description, status, priority, created_at, updated_at
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const updatedTask = result.rows[0];
    
    // Invalidate only this user's cache
    await invalidateUserTaskCaches(userId);
    
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// UPDATED: Delete task with user ownership check
app.delete('/api/tasks/:id', handleUserSession, async (req, res) => {
  const { id } = req.params;
  const userId = req.userId;
  
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2 RETURNING id', 
      [id, userId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Invalidate only this user's cache
    await invalidateUserTaskCaches(userId);
    
    res.json({ message: 'Task deleted successfully', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Clear user's cache only
app.delete('/api/cache', handleUserSession, async (req, res) => {
  try {
    const userId = req.userId;
    await invalidateUserTaskCaches(userId);
    res.json({ message: 'User cache cleared successfully' });
  } catch (error) {
    console.error('Error clearing user cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Get user session info
app.get('/api/user/session', handleUserSession, async (req, res) => {
  try {
    const userId = req.userId;
    const sessionKey = getUserSessionCacheKey(userId);
    const sessionData = await redisClient.get(sessionKey);
    
    res.json({
      userId,
      session: sessionData || null,
      isNewUser: !sessionData
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🔄 Shutting down gracefully...');
  
  try {
    await pool.end();
    console.log('✅ PostgreSQL connection closed');
  } catch (error) {
    console.error('Error closing PostgreSQL connection:', error);
  }
  
  process.exit(0);
});

// Start server function
const startServer = async () => {
  try {
    await testDbConnection();
    await initializeDatabase();
    await initRedis();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`📋 API endpoints: http://localhost:${PORT}/api/tasks`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
