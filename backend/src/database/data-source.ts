import 'reflect-metadata';
import 'dotenv/config';
import { DataSource } from 'typeorm';

export default new DataSource({
  type: 'postgres',

  ...(process.env.DATABASE_URL
    ? {
        url: process.env.DATABASE_URL,
      }
    : {
        host: process.env.DB_HOST || '127.0.0.1',
        port: Number(process.env.DB_PORT || 5433),
        username: process.env.DB_USER || 'smartuser',
        password: process.env.DB_PASSWORD || 'smartpass_local',
        database: process.env.DB_NAME || 'smart_classroom_v2',
      }),

  synchronize: false,
  migrationsRun: false,
  migrationsTableName: 'schema_migrations',
  migrations: [__dirname + '/migrations/*{.js,.ts}'],
  entities: [],
  logging: false,
});