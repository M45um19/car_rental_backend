import { Kafka, Producer, Consumer } from 'kafkajs';
import { env } from './env';

export const kafka = new Kafka({
  clientId: env.kafka.clientId,
  brokers: env.kafka.brokers,
});

let producer: Producer | null = null;

export const getKafkaProducer = (): Producer => {
  if (!producer) {
    producer = kafka.producer();
  }
  return producer;
};

export const getKafkaConsumer = (groupId: string): Consumer => {
  return kafka.consumer({ groupId });
};

/**
 * Ensures specified Kafka topics exist by creating them if missing.
 */
export const ensureTopicsExist = async (topics: string[]): Promise<void> => {
  const admin = kafka.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    const topicsToCreate = topics.filter((t) => !existingTopics.includes(t));

    if (topicsToCreate.length > 0) {
      await admin.createTopics({
        topics: topicsToCreate.map((topic) => ({
          topic,
          numPartitions: 1,
          replicationFactor: 1,
        })),
      });
      console.log(`Kafka topics created successfully: ${topicsToCreate.join(', ')}`);
    }
  } catch (err) {
    console.warn('Kafka topic auto-creation notice:', err);
  } finally {
    try {
      await admin.disconnect();
    } catch {
      // Ignore disconnect errors
    }
  }
};

export default kafka;
