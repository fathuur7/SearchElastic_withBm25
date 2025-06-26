const redisClient = require('../config/redis');

class CacheService {
  constructor() {
    this.defaultTTL = 3600; // 1 hour
    this.prefixes = {
      SEARCH: 'search:',
      PAPER: 'paper:',
      ARTICLE: 'article:',
      STATS: 'stats:',
      AUTOCOMPLETE: 'autocomplete:'
    };
  }

  // Generate cache key with prefix
  generateKey(prefix, ...parts) {
    return prefix + parts.join(':');
  }

  // Get data from cache
  async get(key) {
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  // Set data to cache
  async set(key, data, ttl = this.defaultTTL) {
    try {
      await redisClient.setex(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      return false;
    }
  }

  // Delete from cache
  async del(key) {
    try {
      await redisClient.del(key);
      return true;
    } catch (error) {
      console.error('Cache delete error:', error);
      return false;
    }
  }

  // Delete multiple keys with pattern
  async delPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return keys.length;
    } catch (error) {
      console.error('Cache delete pattern error:', error);
      return 0;
    }
  }

  // Check if key exists
  async exists(key) {
    try {
      return await redisClient.exists(key);
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  // Get cache statistics
  async getStats() {
    try {
      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      return {
        memory: info,
        keyspace: keyspace
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return null;
    }
  }

  // Cache wrapper for functions
  async cacheWrapper(key, fn, ttl = this.defaultTTL) {
    try {
      // Try to get from cache first
      const cached = await this.get(key);
      if (cached !== null) {
        console.log(`Cache hit for key: ${key}`);
        return cached;
      }

      // If not in cache, execute function
      console.log(`Cache miss for key: ${key}`);
      const result = await fn();
      
      // Store result in cache
      await this.set(key, result, ttl);
      
      return result;
    } catch (error) {
      console.error('Cache wrapper error:', error);
      // If cache fails, still return the function result
      return await fn();
    }
  }
}

module.exports = new CacheService();
