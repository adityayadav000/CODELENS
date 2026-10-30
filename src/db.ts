import 'dotenv/config';
import process from 'node:process';
import postgres from 'postgres';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is missing. Add it to your .env file.');
}

// One shared DB connection pool for the whole app
export const sql = postgres(databaseUrl, { max: 5 });