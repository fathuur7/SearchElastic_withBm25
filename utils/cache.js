const redisClient = require('../config/redis'); // Assuming your Redis config is in config/redis.js

class CacheService {
  constructor() {
    this.prefixes = {
      SEARCH: 'search',
      PAPER: 'paper',
      ARTICLE: 'article',
      AUTOCOMPLETE: 'autocomplete',  
      STATS: 'stats'
    };
  }

  generateKey(...parts) {
    return parts.filter(part => part !== undefined && part !== null).join(':');
  }

  async get(key) {
    try {
      // Check if client is connected
      if (!redisClient.isOpen) {
        console.warn('Redis client not connected, skipping cache get');
        return null;
      }

      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null; // Return null on error to allow fallback to source
    }
  }

  async set(key, value, ttlSeconds = 3600) {
    try {
      // Check if client is connected
      if (!redisClient.isOpen) {
        console.warn('Redis client not connected, skipping cache set');
        return false;
      }

      // Use the modern Redis v4+ API - note the capital E in setEx
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Cache set error:', error);
      // Try alternative method if setEx fails
      try {
        await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
        return true;
      } catch (altError) {
        console.error('Alternative cache set also failed:', altError);
        return false;
      }
    }
  }

  async del(key) {
    try {
      if (!redisClient.isOpen) {
        console.warn('Redis client not connected, skipping cache delete');
        return 0;
      }

      return await redisClient.del(key);
    } catch (error) {
      console.error('Cache delete error:', error);
      return 0;
    }
  }

  async delPattern(pattern) {
    try {
      if (!redisClient.isOpen) {
        console.warn('Redis client not connected, skipping cache pattern delete');
        return 0;
      }

      const keys = await redisClient.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      return await redisClient.del(keys);
    } catch (error) {
      console.error('Cache pattern delete error:', error);
      return 0;
    }
  }

  async exists(key) {
    try {
      if (!redisClient.isOpen) {
        return false;
      }

      return await redisClient.exists(key);
    } catch (error) {
      console.error('Cache exists error:', error);
      return false;
    }
  }

  async getStats() {
    try {
      if (!redisClient.isOpen) {
        return { error: 'Redis client not connected' };
      }

      const info = await redisClient.info('memory');
      const keyspace = await redisClient.info('keyspace');
      const stats = await redisClient.info('stats');

      return {
        memory: info,
        keyspace: keyspace,
        stats: stats,
        connected: redisClient.isOpen
      };
    } catch (error) {
      console.error('Cache stats error:', error);
      return { error: error.message };
    }
  }

  async cacheWrapper(key, dataFetcher, ttlSeconds = 3600) {
    try {
      // Try to get from cache first
      const cachedData = await this.get(key);
      if (cachedData !== null) {
        console.log(`Cache hit for key: ${key}`);
        return cachedData;
      }

      console.log(`Cache miss for key: ${key}`);
      
      // Fetch fresh data
      const freshData = await dataFetcher();
      
      // Cache the result (don't await to avoid blocking)
      this.set(key, freshData, ttlSeconds).catch(error => {
        console.error('Background cache set failed:', error);
      });

      return freshData;
    } catch (error) {
      console.error('Cache wrapper error:', error);
      // If caching fails, still try to get fresh data
      try {
        return await dataFetcher();
      } catch (fetchError) {
        console.error('Data fetcher error:', fetchError);
        throw fetchError;
      }
    }
  }

  // Method to check if Redis is healthy
  async isHealthy() {
    try {
      if (!redisClient.isOpen) {
        return false;
      }
      
      await redisClient.ping();
      return true;
    } catch (error) {
      console.error('Redis health check failed:', error);
      return false;
    }
  }

  // Method to reconnect if needed
  async reconnect() {
    try {
      if (!redisClient.isOpen) {
        await redisClient.connect();
        console.log('Redis reconnected successfully');
        return true;
      }
      return true;
    } catch (error) {
      console.error('Redis reconnection failed:', error);
      return false;
    }
  }
}

// Create singleton instance
const cache = new CacheService();

module.exports = cache;