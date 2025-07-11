// FIXED: Get all tasks with priority column
app.get('/api/tasks', async (req, res) => {
  try {
    // Try to get from cache first
    const cachedTasks = await redisClient.get(CACHE_KEYS.ALL_TASKS);
    
    if (cachedTasks) {
      console.log('📋 Serving tasks from Redis cache');
      // ✅ FIXED: Upstash Redis already returns parsed objects, no need to JSON.parse
      return res.json(cachedTasks);
    }
    
    // If not in cache, get from database
    console.log('🔍 Fetching tasks from database');
    const result = await pool.query(`
      SELECT id, title, description, status, priority, created_at, updated_at 
      FROM tasks 
      ORDER BY created_at DESC
    `);
    
    const tasks = result.rows;
    
    // Cache the result
    // ✅ FIXED: Store as object directly (Upstash handles JSON serialization)
    await redisClient.setex(CACHE_KEYS.ALL_TASKS, CACHE_TTL, tasks);
    console.log('💾 Tasks cached in Redis');
    
    res.json(tasks);
  } catch (error) {
    console.error('Error fetching tasks:', error);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// FIXED: Get single task by ID with priority
app.get('/api/tasks/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = getTaskCacheKey(id);
  
  try {
    // Try cache first
    const cachedTask = await redisClient.get(cacheKey);
    
    if (cachedTask) {
      console.log(`📋 Serving task ${id} from Redis cache`);
      // ✅ FIXED: No JSON.parse needed
      return res.json(cachedTask);
    }
    
    // Get from database
    const result = await pool.query(`
      SELECT id, title, description, status, priority, created_at, updated_at 
      FROM tasks 
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const task = result.rows[0];
    
    // Cache the task
    // ✅ FIXED: Store as object directly
    await redisClient.setex(cacheKey, CACHE_TTL, task);
    console.log(`💾 Task ${id} cached in Redis`);
    
    res.json(task);
  } catch (error) {
    console.error('Error fetching task:', error);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
});
