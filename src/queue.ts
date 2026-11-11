import { Queue } from 'bullmq';
import 'dotenv/config';

// 1. Connection settings for Redis
export const redisConnection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  maxRetriesPerRequest: null, // Required by BullMQ to prevent connection timeouts during long jobs
};

export const INGEST_QUEUE_NAME = 'repo-ingestion';

// 2. TypeScript interface for Job Input Data
export interface IngestJobData {
  repoUrl: string;
}

// 3. TypeScript interface for Live Progress Updates
export interface IngestJobProgress {
  stage: 'cloning' | 'listing' | 'embedding' | 'done';
  percent: number;
  message: string;
  current?: number;
  total?: number;
}

// 4. The shared BullMQ Queue instance
export const ingestQueue = new Queue<IngestJobData>(INGEST_QUEUE_NAME, {
  connection: redisConnection,
});