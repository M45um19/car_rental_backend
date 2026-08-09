import { getKafkaConsumer } from './config/kafka';
import { env } from './config/env';

const startWorker = async () => {
  console.log('Starting Kafka worker consumer...');
  try {
    const consumer = getKafkaConsumer(env.kafka.groupId);
    await consumer.connect();
    console.log(`Kafka worker consumer connected to group: ${env.kafka.groupId}`);
    
    await consumer.subscribe({ topic: env.kafka.topic, fromBeginning: true });
    
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const payload = message.value?.toString();
        console.log(`Kafka Worker - Received message from topic ${topic} partition ${partition}`);
        console.log(`Payload: ${payload}`);
      },
    });
  } catch (error) {
    console.error('Kafka consumer worker failed to start:', error);
  }
};

startWorker();
