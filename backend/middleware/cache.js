const redis = require('redis');

class CacheManager {
  constructor() {
    this.client = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });

    this.client.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      console.log('Connected to Redis');
    });

    this.connect();
  }

  async connect() {
    try {
      await this.client.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
    }
  }

  // Cache middleware for Express routes
  cacheMiddleware(ttl = 300) { // 5 minutes default
    return async (req, res, next) => {
      if (req.method !== 'GET') {
        return next();
      }

      const key = `cache:${req.originalUrl}`;
      
      try {
        const cached = await this.get(key);
        if (cached) {
          console.log(`Cache hit for ${key}`);
          return res.json(JSON.parse(cached));
        }
        
        // Store original res.json
        const originalJson = res.json;
        
        // Override res.json to cache the response
        res.json = (data) => {
          this.set(key, JSON.stringify(data), ttl);
          return originalJson.call(res, data);
        };
        
        next();
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  async get(key) {
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 300) {
    try {
      await this.client.setEx(key, ttl, value);
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async del(key) {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async clear(pattern = '*') {
    try {
      const keys = await this.client.keys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // Invalidate cache for specific routes
  async invalidateTaskCache(taskId = null) {
    const patterns = [
      'cache:/api/tasks*',
      'cache:/api/search*'
    ];
    
    if (taskId) {
      patterns.push(`cache:/api/tasks/${taskId}*`);
    }

    for (const pattern of patterns) {
      await this.clear(pattern);
    }
  }
}

module.exports = new CacheManager();