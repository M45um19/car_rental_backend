import { createClient } from 'redis';
import { env } from './env';

const redisUrl = env.redis.password
  ? `redis://:${env.redis.password}@${env.redis.host}:${env.redis.port}`
  : `redis://${env.redis.host}:${env.redis.port}`;

export const redisClient = createClient({
  url: redisUrl,
});

redisClient.on('error', (err) => {
  console.error('Redis client error:', err);
});

redisClient.on('connect', () => {
  console.log('Redis client connected');
});

export default redisClient;
