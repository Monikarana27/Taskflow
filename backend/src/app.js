const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware - CORS configuration
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

// Middleware to handle user sessions (without Redis)
const handleUserSession = async (req, res, next) => {
  try {
    let userId = req.headers['x-user-id'];
    
    if (!userId) {
      // Generate new user ID if not provided
      userId = uuidv4();
      res.setHeader('X-User-Id', userId);
    }
    
    req.userId = userId;
    console.log(`👤 User session: ${userId}`);
    next();
  } catch (error) {
    console.error('Error handling user session:', error);
    // Continue without session if there's an error
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
    throw error;
  }
};

// Initialize database with user_id column
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
    throw error;
  }
};

// Routes

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'Task Management API',
    version: '2.0.0',
    features: ['User Sessions', 'Task Isolation', 'No Cache (Redis Disabled)'],
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
    
    res.json({ 
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        redis: 'disabled'
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

// Search tasks for specific user
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
    console.log(`🔍 Search results for user ${userId}: ${result.rows.length} tasks found`);
    res.json(result.rows);
  } catch (error) {
    console.error('Error searching tasks:', error);
    res.status(500).json({ error: 'Failed to search tasks' });
  }
});

// Get all tasks for specific user
app.get('/api/tasks', handleUserSession, async (req, res) => {
  try {
    const userId = req.userId;
    
    console.log(`🔍 Fetching tasks for user ${userId} from database`);
    const result = await pool.query(`
      SELECT id, title, description, status, priority, created_at, updated_at 
      FROM tasks 
      WHERE user_id = $1
      ORDER BY created_at DESC
    `, [userId]);
    
    const tasks = result.rows;
    console.log(`📋 Found ${tasks.length} tasks for user ${userId}`);
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task by ID (with user ownership check)
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
    
    console.log(`📋 Task ${id} fetched for user ${userId}`);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task with user association
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
    console.log(`✅ Task created for user ${userId}: ${newTask.title}`);
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task with user ownership check
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
    console.log(`✅ Task ${id} updated for user ${userId}`);
    
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task with user ownership check
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
    
    console.log(`🗑️ Task ${id} deleted for user ${userId}`);
    res.json({ message: 'Task deleted successfully', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Get user session info
app.get('/api/user/session', handleUserSession, async (req, res) => {
  try {
    const userId = req.userId;
    
    res.json({
      userId,
      session: null, // No Redis session data
      isNewUser: false,
      cacheStatus: 'disabled'
    });
  } catch (error) {
    console.error('Error getting session info:', error);
    res.status(500).json({ error: 'Failed to get session info' });
  }
});

// Test endpoint for debugging
app.get('/test', (req, res) => {
  res.json({
    message: 'Backend is working!',
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    env: process.env.NODE_ENV || 'development'
  });
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
    console.log('🚀 Starting server...');
    
    // Test database connection
    console.log('🔍 Testing database connection...');
    await testDbConnection();
    
    // Initialize database
    console.log('🔍 Initializing database...');
    await initializeDatabase();
    
    console.log('⚠️ Redis disabled - running without cache');
    
    // Start the server
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Health check: https://taskflow-ljzo.onrender.com/health`);
      console.log(`📋 API endpoints: https://taskflow-ljzo.onrender.com/api/tasks`);
      console.log(`🔧 Cache: Disabled (Redis removed)`);
    });
    
    // Handle server errors
    server.on('error', (error) => {
      console.error('❌ Server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error('❌ Error details:', error.message);
    process.exit(1);
  }
};

startServer();
