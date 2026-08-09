import knex, { Knex } from 'knex';
import { env } from './env';

const knexConfig: Knex.Config = {
  client: 'pg',
  connection: {
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
  },
  pool: {
    min: env.db.poolMin,
    max: env.db.poolMax,
  },
};

export const db: Knex = knex(knexConfig);
export default db;
