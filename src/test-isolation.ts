import 'dotenv/config';
import { sql } from './db.js';
import { searchChunks } from './search.js';

async function runIsolationTest(): Promise<void> {
  console.log('🧪 Starting Multi-Repository Isolation Integration Test...\n');

  // Step 1: Fetch two different repositories from the database
  const repos = await sql<{ id: string; full_name: string }[]>`
    SELECT id, full_name
    FROM repositories
    ORDER BY updated_at DESC
    LIMIT 2
  `;

  if (repos.length < 2) {
    console.warn('⚠️ Warning: Need at least 2 indexed repositories to test isolation.');
    console.log(`Found only ${repos.length} repository. Index a second repository to run this test.`);
    await sql.end();
    return;
  }

  const repoA = repos[0];
  const repoB = repos[1];

  if (!repoA || !repoB) {
    throw new Error('Failed to retrieve repositories from database.');
  }

  console.log(`Target Repo A: ${repoA.full_name} (ID: ${repoA.id})`);
  console.log(`Target Repo B: ${repoB.full_name} (ID: ${repoB.id})\n`);

  // Step 2: Query Repo A and verify ZERO chunks belong to Repo B
  console.log(`Testing Query scoped to Repo A: "${repoA.full_name}"...`);
  const resultsA = await searchChunks('function export class return error', repoA.id);

  if (resultsA.length === 0) {
    console.log('No chunks found for Repo A (repo might be empty).');
  } else {
    for (const chunk of resultsA) {
      if (chunk.repo_name !== repoA.full_name) {
        console.error(`❌ ISOLATION LEAK DETECTED! Expected ${repoA.full_name}, but got chunk from: ${chunk.repo_name}`);
        process.exit(1);
      }
    }
    console.log(`✅ Passed: 100% of chunks (${resultsA.length}/${resultsA.length}) strictly belong to Repo A.`);
  }

  // Step 3: Query Repo B and verify ZERO chunks belong to Repo A
  console.log(`\nTesting Query scoped to Repo B: "${repoB.full_name}"...`);
  const resultsB = await searchChunks('function export class return error', repoB.id);

  if (resultsB.length === 0) {
    console.log('No chunks found for Repo B (repo might be empty).');
  } else {
    for (const chunk of resultsB) {
      if (chunk.repo_name !== repoB.full_name) {
        console.error(`❌ ISOLATION LEAK DETECTED! Expected ${repoB.full_name}, but got chunk from: ${chunk.repo_name}`);
        process.exit(1);
      }
    }
    console.log(`✅ Passed: 100% of chunks (${resultsB.length}/${resultsB.length}) strictly belong to Repo B.`);
  }

  console.log('\n🎉 Multi-Repository Isolation Verified: No cross-tenant data leaks.');
  await sql.end();
}

runIsolationTest().catch(function handleError(err: unknown) {
  console.error('Test execution failed:', err);
  process.exit(1);
});