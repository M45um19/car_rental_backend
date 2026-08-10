import { createApp } from './app';
import { env } from './config/env';
import { db } from './config/db';
import { redisClient } from './config/redis';
import { getKafkaProducer, ensureTopicsExist } from './config/kafka';

const startServer = async () => {
  const app = createApp();

  // 1. Test Database Connection
  try {
    await db.raw('SELECT 1');
    console.log('Database connection verified successfully.');
  } catch (error) {
    console.error('Database connection failed:', error);
    process.exit(1);
  }

  // 2. Connect to Redis
  try {
    await redisClient.connect();
  } catch (error) {
    console.error('Redis connection failed:', error);
  }

  // 3. Test/Connect Kafka Producer & Ensure Topics Exist
  try {
    await ensureTopicsExist(['rental-batch-queue', 'rental-dlq']);
    const producer = getKafkaProducer();
    await producer.connect();
    console.log('Kafka producer connected successfully.');
  } catch (error) {
    console.error('Kafka producer connection failed:', error);
  }

  // 4. Start HTTP Server
  app.listen(env.port, () => {
    console.log(`Server is running in ${env.nodeEnv} mode on port ${env.port}`);
  });
};

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
