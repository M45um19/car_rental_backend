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

export default kafka;
