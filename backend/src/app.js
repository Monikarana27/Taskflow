const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { Redis } = require('@upstash/redis');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection - FIXED VERSION
let pool;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL (for Render, Heroku, etc.)
  console.log('🔄 Using DATABASE_URL for PostgreSQL connection');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  });
} else {
  // Use individual environment variables (for local development)
  console.log('🔄 Using individual environment variables for PostgreSQL');
  console.log('🔍 DB_HOST:', process.env.DB_HOST || 'localhost');
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
  ALL_TASKS: 'tasks:all',
  TASK_BY_ID: 'task:',
  SEARCH_RESULTS: 'search:'
};

// Helper function to get cache key for task by ID
const getTaskCacheKey = (id) => `${CACHE_KEYS.TASK_BY_ID}${id}`;

// Helper function to get cache key for search
const getSearchCacheKey = (query) => `${CACHE_KEYS.SEARCH_RESULTS}${query.toLowerCase()}`;

// Cache invalidation helper
const invalidateTaskCaches = async () => {
  try {
    const keys = await redisClient.keys('tasks:*');
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    
    // Also clear search caches as they might be outdated
    const searchKeys = await redisClient.keys('search:*');
    if (searchKeys.length > 0) {
      await redisClient.del(searchKeys);
    }
  } catch (error) {
    console.error('Error invalidating cache:', error);
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

// Initialize database and add sample data
const initializeDatabase = async () => {
  try {
    // First check if the table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tasks'
      );
    `);

    if (!tableExists.rows[0].exists) {
      console.log('📋 Tasks table does not exist, attempting to create...');
      
      try {
        // Create tasks table if it doesn't exist
        await pool.query(`
          CREATE TABLE IF NOT EXISTS tasks (
            id SERIAL PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            status VARCHAR(50) DEFAULT 'todo',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ Database table created successfully');
      } catch (createError) {
        console.error('❌ Error creating table:', createError.message);
        console.log('💡 Please create the table manually using the SQL commands provided');
        console.log('   Or ask your database administrator to grant CREATE permissions');
        return; // Exit early if table creation fails
      }
    } else {
      console.log('✅ Tasks table already exists');
    }
    
    // Check if table has data and add sample data if empty
    try {
      const result = await pool.query('SELECT COUNT(*) FROM tasks');
      if (result.rows[0].count === '0') {
        await pool.query(`
          INSERT INTO tasks (title, description, status) VALUES
          ('Finish report', 'Complete Q3 summary', 'todo'),
          ('Team meeting', 'Discuss project goals', 'done'),
          ('Buy groceries', 'Milk, eggs, bread', 'todo'),
          ('Exercise routine', 'Go for a 30-minute run', 'in progress'),
          ('Read documentation', 'Study React hooks and state management', 'todo')
        `);
        console.log('✅ Sample data inserted');
      } else {
        console.log(`✅ Table already contains ${result.rows[0].count} tasks`);
      }
    } catch (dataError) {
      console.error('❌ Error checking/inserting sample data:', dataError.message);
      // Don't stop the server if sample data insertion fails
    }
    
  } catch (error) {
    console.error('❌ Error during database initialization:', error.message);
    
    // Test if we can at least read from the table
    try {
      await pool.query('SELECT COUNT(*) FROM tasks LIMIT 1');
      console.log('✅ Tasks table is accessible for reading');
    } catch (accessError) {
      console.error('❌ Cannot access tasks table:', accessError.message);
      console.log('💡 Please ensure the tasks table exists and user has proper permissions');
    }
  }
};

// Routes

// Root route - Add this for basic frontend
app.get('/', (req, res) => {
  res.json({
    message: 'Task Management API',
    version: '1.0.0',
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
    // Test database connection
    await pool.query('SELECT 1');
    
    // Test Redis connection
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

// Get all tasks with Redis caching
app.get('/api/tasks', async (req, res) => {
  try {
    // Try to get from cache first
    const cachedTasks = await redisClient.get(CACHE_KEYS.ALL_TASKS);
    
    if (cachedTasks) {
      console.log('📋 Serving tasks from Redis cache');
      return res.json(JSON.parse(cachedTasks));
    }
    
    // If not in cache, get from database
    console.log('🔍 Fetching tasks from database');
    const result = await pool.query(`
      SELECT id, title, description, status, created_at, updated_at 
      FROM tasks 
      ORDER BY created_at DESC
    `);
    
    const tasks = result.rows;
    
    // Cache the result
    await redisClient.setex(CACHE_KEYS.ALL_TASKS, CACHE_TTL, JSON.stringify(tasks));
    console.log('💾 Tasks cached in Redis');
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// Get single task by ID with caching
app.get('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = getTaskCacheKey(id);
  
  try {
    // Try cache first
    const cachedTask = await redisClient.get(cacheKey);
    
    if (cachedTask) {
      console.log(`📋 Serving task ${id} from Redis cache`);
      return res.json(JSON.parse(cachedTask));
    }
    
    // Get from database
    const result = await pool.query(`
      SELECT id, title, description, status, created_at, updated_at 
      FROM tasks 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = result.rows[0];
    
    // Cache the task
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(task));
    console.log(`💾 Task ${id} cached in Redis`);
    
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});

// Create new task
app.post('/api/tasks', async (req, res) => {
  const { title, description, status = 'todo' } = req.body;
  
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Task title is required' });
  }
  
  try {
    const result = await pool.query(`
      INSERT INTO tasks (title, description, status, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, title, description, status, created_at, updated_at
    `, [title.trim(), description?.trim() || '', status]);
    
    const newTask = result.rows[0];
    
    // Invalidate caches
    await invalidateTaskCaches();
    console.log('🗑️ Task caches invalidated after creation');
    
    res.status(201).json(newTask);
  } catch (error) {
    console.error('Error creating task:', error);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, status } = req.body;
  
  try {
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
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
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    updates.push(`updated_at = NOW()`);
    values.push(id);
    
    const query = `
      UPDATE tasks 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount}
      RETURNING id, title, description, status, created_at, updated_at
    `;
    
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const updatedTask = result.rows[0];
    
    // Invalidate caches
    await invalidateTaskCaches();
    await redisClient.del(getTaskCacheKey(id));
    console.log(`🗑️ Task caches invalidated after update of task ${id}`);
    
    res.json(updatedTask);
  } catch (error) {
    console.error('Error updating task:', error);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM tasks WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    // Invalidate caches
    await invalidateTaskCaches();
    await redisClient.del(getTaskCacheKey(id));
    console.log(`🗑️ Task caches invalidated after deletion of task ${id}`);
    
    res.json({ message: 'Task deleted successfully', id: parseInt(id) });
  } catch (error) {
    console.error('Error deleting task:', error);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

// Search tasks with caching
app.post('/api/tasks/search', async (req, res) => {
  const { query, limit = 10 } = req.body;
  
  if (!query || !query.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }
  
  const searchQuery = query.trim().toLowerCase();
  const cacheKey = getSearchCacheKey(searchQuery);
  
  try {
    // Try cache first
    const cachedResults = await redisClient.get(cacheKey);
    
    if (cachedResults) {
      console.log(`🔍 Serving search results for "${searchQuery}" from Redis cache`);
      return res.json(JSON.parse(cachedResults));
    }
    
    // Search in database (simple text search for now)
    const searchResult = await pool.query(`
      SELECT id, title, description, status, created_at, updated_at,
             ts_rank(to_tsvector('english', title || ' ' || COALESCE(description, '')), 
                     plainto_tsquery('english', $1)) as rank
      FROM tasks 
      WHERE to_tsvector('english', title || ' ' || COALESCE(description, '')) 
            @@ plainto_tsquery('english', $1)
      ORDER BY rank DESC, created_at DESC
      LIMIT $2
    `, [searchQuery, limit]);
    
    const results = searchResult.rows;
    
    // Cache the search results
    await redisClient.setex(cacheKey, CACHE_TTL, JSON.stringify(results));
    console.log(`💾 Search results for "${searchQuery}" cached in Redis`);
    
    res.json(results);
  } catch (error) {
    console.error('Error searching tasks:', error);
    
    // Fallback to simple LIKE search if full-text search fails
    try {
      const fallbackResult = await pool.query(`
        SELECT id, title, description, status, created_at, updated_at
        FROM tasks 
        WHERE LOWER(title) LIKE LOWER($1) OR LOWER(description) LIKE LOWER($1)
        ORDER BY created_at DESC
        LIMIT $2
      `, [`%${searchQuery}%`, limit]);
      
      res.json(fallbackResult.rows);
    } catch (fallbackError) {
      console.error('Fallback search also failed:', fallbackError);
      res.status(500).json({ error: 'Failed to search tasks' });
    }
  }
});

// Clear all caches (useful for debugging)
app.delete('/api/cache', async (req, res) => {
  try {
    await redisClient.flushall();
    console.log('🗑️ All Redis caches cleared');
    res.json({ message: 'All caches cleared successfully' });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({ error: 'Failed to clear cache' });
  }
});

// Get cache statistics
app.get('/api/cache/stats', async (req, res) => {
  try {
    const info = await redisClient.info();
    const keyCount = await redisClient.dbsize();
    
    res.json({
      connected: true,
      keyCount,
      memoryInfo: info
    });
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache statistics' });
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
  
  // Note: Upstash Redis SDK doesn't need explicit close method
  console.log('✅ Redis connection closed');
  
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
    // Initialize connections
    await testDbConnection();
    await initializeDatabase();
    await initRedis();
    
    // Start the server
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

// Start the server
startServer();
