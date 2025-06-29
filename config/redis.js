const redis = require('redis');

const redisClient = redis.createClient({
  socket: {
    host: 'localhost',
    port: 6379,
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        console.error('Redis reconnection attempts exhausted');
        return new Error('Redis reconnection failed');
      }
      console.log(`Redis reconnecting... attempt ${retries}`);
      return Math.min(retries * 50, 1000);
    }
  },
  // Remove password if not needed, or set it properly
  // password: 'your_password_here',
  database: 0
});

// Handle connection events
redisClient.on('connect', () => {
  console.log('Redis client connected');
});

redisClient.on('ready', () => {
  console.log('Redis client ready');
});

redisClient.on('error', (err) => {
  console.error('Redis error:', err);
});

redisClient.on('end', () => {
  console.log('Redis client disconnected');
});

redisClient.on('reconnecting', () => {
  console.log('Redis client reconnecting...');
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('Redis connected successfully');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
})();

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Closing Redis connection...');
  await redisClient.quit();
  process.exit(0);
});

module.exports = redisClient;