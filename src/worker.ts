import { getKafkaConsumer, getKafkaProducer, ensureTopicsExist } from './config/kafka';
import { env } from './config/env';
import { db } from './config/db';
import { RentalRepository } from './modules/rentals/rental.repository';
import { RentalCache } from './modules/rentals/rental.cache';
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
    const rentalCache = new RentalCache();
    const batchProcessor = new RentalBatchProcessor(rentalRepository, rentalCache);

    const consumer = getKafkaConsumer(env.kafka.groupId);
    await consumer.connect();
    console.log(`Kafka worker consumer connected to group: ${env.kafka.groupId}`);

    // Subscribe to rental-batch-queue topic
    await consumer.subscribe({ topic: 'rental-batch-queue', fromBeginning: true });

    await consumer.run({
      eachBatchAutoResolve: false,
      eachBatch: async ({ batch, resolveOffset, heartbeat, commitOffsetsIfNecessary, isStale }) => {
        const validPayloads: IRentalPayload[] = [];

        for (const message of batch.messages) {
          if (isStale()) break;
          const rawPayload = message.value?.toString();
          if (!rawPayload) {
            resolveOffset(message.offset);
            continue;
          }

          try {
            const payload: IRentalPayload = JSON.parse(rawPayload);
            validPayloads.push(payload);
          } catch (parseErr) {
            console.error('[Worker] Error parsing rental batch payload:', parseErr);
            // Skip unparseable JSON payload and resolve offset
            resolveOffset(message.offset);
          }
        }

        if (validPayloads.length > 0) {
          // Execute DB bulk insertion and DLQ routing for batch BEFORE committing offsets
          await batchProcessor.processDirectBatch(validPayloads);
        }

        // Mark all messages in batch as resolved after successful processing/DLQ routing
        for (const message of batch.messages) {
          resolveOffset(message.offset);
        }

        // Commit offsets to Kafka broker
        await commitOffsetsIfNecessary();
        await heartbeat();
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
