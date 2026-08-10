import dotenv from 'dotenv';
import Joi from 'joi';
import path from 'path';

dotenv.config();

const envSchema = Joi.object({
  PORT: Joi.number().default(3000),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  JWT_ACCESS_SECRET: Joi.string().required(),
  JWT_REFRESH_SECRET: Joi.string().required(),
  APP_DOMAIN: Joi.string().default('http://localhost:3000'),
  UPLOAD_PATH: Joi.string().default('uploads/'),
  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),
  DB_POOL_MIN: Joi.number().default(2),
  DB_POOL_MAX: Joi.number().default(10),
  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().default(6379),
  REDIS_PASSWORD: Joi.string().allow('', null).default(''),
  OPENSEARCH_NODE: Joi.string().uri().required(),
  KAFKA_CLIENT_ID: Joi.string().default('rental-service'),
  KAFKA_BROKERS: Joi.string().required(),
  KAFKA_GROUP_ID: Joi.string().default('rental-group'),
}).unknown().required();

const { error, value: envVars } = envSchema.validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export const env = {
  port: envVars.PORT as number,
  nodeEnv: envVars.NODE_ENV as string,
  jwtAccessSecret: envVars.JWT_ACCESS_SECRET as string,
  jwtRefreshSecret: envVars.JWT_REFRESH_SECRET as string,
  appDomain: (envVars.APP_DOMAIN as string).replace(/\/$/, ''),
  uploadPath: path.resolve(envVars.UPLOAD_PATH as string),
  db: {
    host: envVars.DB_HOST as string,
    port: envVars.DB_PORT as number,
    user: envVars.DB_USER as string,
    password: envVars.DB_PASSWORD as string,
    database: envVars.DB_NAME as string,
    poolMin: envVars.DB_POOL_MIN as number,
    poolMax: envVars.DB_POOL_MAX as number,
  },
  redis: {
    host: envVars.REDIS_HOST as string,
    port: envVars.REDIS_PORT as number,
    password: envVars.REDIS_PASSWORD as string,
  },
  opensearch: {
    node: envVars.OPENSEARCH_NODE as string,
  },
  kafka: {
    clientId: envVars.KAFKA_CLIENT_ID as string,
    brokers: (envVars.KAFKA_BROKERS as string).split(','),
    groupId: envVars.KAFKA_GROUP_ID as string,
  },
};
