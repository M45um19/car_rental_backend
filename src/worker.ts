import { getKafkaConsumer, getKafkaProducer, ensureTopicsExist } from './config/kafka';
import { env } from './config/env';
import { db } from './config/db';
import { RentalRepository } from './modules/rentals/rental.repository';
import { RentalBatchProcessor } from './kafka/rental.handler';
import { IRentalPayload } from './modules/rentals/rental.interface';

const startWorker = async () => {
  console.log('Starting Kafka worker consumer...');
  try {
    // Verify DB connection
    await db.raw('SELECT 1');
    console.log('Worker DB connection verified.');

    // Ensure required Kafka topics exist before subscribing/producing
    await ensureTopicsExist(['rental-batch-queue', 'rental-dlq']);

    // Connect Producer for DLQ
    const producer = getKafkaProducer();
    await producer.connect();
    console.log('Worker Kafka producer connected.');

    const rentalRepository = new RentalRepository(db);
    const batchProcessor = new RentalBatchProcessor(rentalRepository);

    const consumer = getKafkaConsumer(env.kafka.groupId);
    await consumer.connect();
    console.log(`Kafka worker consumer connected to group: ${env.kafka.groupId}`);

    // Subscribe to rental-batch-queue topic
    await consumer.subscribe({ topic: 'rental-batch-queue', fromBeginning: true });

    await consumer.run({
      eachMessage: async ({ message }) => {
        const rawPayload = message.value?.toString();
        if (!rawPayload) return;

        try {
          const payload: IRentalPayload = JSON.parse(rawPayload);
          batchProcessor.addMessage(payload);
        } catch (parseErr) {
          console.error('[Worker] Error parsing rental batch payload:', parseErr);
        }
      },
    });

    // Graceful shutdown handling
    const shutdown = async () => {
      console.log('Shutting down worker...');
      await batchProcessor.flush();
      await consumer.disconnect();
      await producer.disconnect();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Kafka consumer worker failed to start:', error);
  }
};

startWorker();
