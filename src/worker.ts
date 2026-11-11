import { Worker, Job } from 'bullmq';
import {
  redisConnection,
  INGEST_QUEUE_NAME,
  type IngestJobData,
  type IngestJobProgress,
} from './queue.js';
import { ingestRepoFromUrl } from './ingest-repo.js';

console.log('🚀 [BullMQ Worker] Initializing background ingestion worker...');

// 1. Create the BullMQ worker
export const ingestWorker = new Worker<IngestJobData>(
  INGEST_QUEUE_NAME,
  async (job: Job<IngestJobData>) => {
    console.log(`\n📦 [Job ${job.id}] Started processing: ${job.data.repoUrl}`);

    // Progress reporter callback that updates the job state in Redis
    const reportProgress = async (progress: IngestJobProgress) => {
      console.log(`[Job ${job.id}] [${progress.percent}%] ${progress.message}`);
      await job.updateProgress(progress);
    };

    // Run the actual ingestion with the progress callback
    const result = await ingestRepoFromUrl(job.data.repoUrl, reportProgress);

    console.log(`✅ [Job ${job.id}] Finished successfully:`, result);
    return result;
  },
  {
    connection: redisConnection,
    concurrency: 2, // Process up to 2 repositories concurrently
  },
);

// 2. Lifecycle listeners for system observability
ingestWorker.on('completed', (job) => {
  console.log(`🎉 [Job ${job.id}] Completed successfully!`);
});

ingestWorker.on('failed', (job, err) => {
  console.error(`❌ [Job ${job?.id}] Failed with error:`, err.message);
});