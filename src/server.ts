import express from 'express';
import process from 'node:process';
import { searchChunks } from './search.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { critiqueAnswer } from './critic.js';
import { draftAnswerFromEvidence } from './answer.js';
import { ingestRepoFromUrl } from './ingest-repo.js';
import { ingestQueue } from './queue.js';
import { sql } from './db.js';

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve the simple UI from /public
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// Return all indexed repositories and their chunk counts
app.get('/repos', async (_req, res) => {
  try {
    const repos = await sql`
         SELECT
      r.id,
      r.full_name,
      r.clone_url,
      r.updated_at,
      (
        SELECT count(c.id) 
        FROM code_chunks c
        JOIN commits cm ON c.commit_id = cm.id
        WHERE cm.repository_id = r.id
        AND cm.id = (
          SELECT id FROM commits 
          WHERE repository_id = r.id 
          ORDER BY created_at DESC 
          LIMIT 1
        )
      ) AS chunk_count
    FROM repositories r
    ORDER BY r.updated_at DESC
    `;
    res.json({ ok: true, repositories: repos });
  } catch (err) {
    console.error('Failed to list repos:', err);
    res.status(500).json({ error: 'Failed to retrieve repositories' });
  }
});

app.post('/ask', async (req, res) => {
  try {
       const question = req.body?.question;
    const repoId = req.body?.repoId ? String(req.body.repoId) : undefined; // <--- READ REPO ID

    if (typeof question !== 'string' || question.trim() === '') {
      res.status(400).json({
        error: 'Send JSON: { "question": "your question" }',
      });
      return;
    }

    // Pass repoId to searchChunks so it only searches that repo!
    const rows = await searchChunks(question.trim(), repoId);

    

    const citations = rows.map((row) => ({
      repo_name: row.repo_name,
      path: row.path,
      start_line: row.start_line,
      end_line: row.end_line,
      kind: row.kind,
      meaning_score: row.meaning_score,
      keyword_score: row.keyword_score,
      preview: row.content_preview,
    }));

     const evidenceChunks = rows.map((row) => ({
      path: String(row.path),
      start_line: Number(row.start_line),
      end_line: Number(row.end_line),
      content_preview: String(row.content ?? row.content_preview ?? ''),
    }));

    // ===== AGENTIC REFLEXION LOOP =====
    const MAX_ATTEMPTS = 2;
    let attempts = 0;
    let answer = '';
    let critic = { pass: false, notes: 'Critic did not run' };
    const history: Array<{ attempt: number; answer: string; critic: typeof critic }> = [];

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      console.log(`\n🤖 [Agent Loop] Starting Attempt ${attempts} of ${MAX_ATTEMPTS}...`);

      // On attempt 2+, pass the previous draft and critic notes for self-correction!
      const previousDraft = attempts > 1 ? answer : undefined;
      const criticFeedback = attempts > 1 ? critic.notes : undefined;

      try {
        answer = await draftAnswerFromEvidence(
          question.trim(),
          evidenceChunks,
          previousDraft,
          criticFeedback
        );
      } catch (err) {
        console.error(`Draft attempt ${attempts} failed:`, err);
        answer =
          rows.length === 0
            ? 'I could not find relevant code for this question.'
            : 'LLM drafting unavailable.';
        break;
      }

      // Critic verifies the draft against evidence
      try {
        critic = await critiqueAnswer(question.trim(), answer, evidenceChunks);
      } catch (err) {
        console.error(`Critic attempt ${attempts} failed:`, err);
        critic = {
          pass: false,
          notes: 'Critic failed: ' + (err instanceof Error ? err.message : String(err)),
        };
      }

      history.push({ attempt: attempts, answer, critic });

      // If the Critic verifies the answer, we break early! (Success)
      if (critic.pass) {
        console.log(`✅ [Agent Loop] Verified successfully on attempt ${attempts}!`);
        break;
      } else {
        console.warn(`⚠️ [Agent Loop] Critic rejected attempt ${attempts}. Reason: ${critic.notes}`);
      }
    }

    console.log(`Sending verified response to client (Completed in ${attempts} attempts).`);
    res.json({
      question,
      answer,
      citations,
      critic,
      attempts, // 1 = first try passed, 2 = needed self-correction
      history,  // Full audit trail of thoughts/critiques
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while answering.' });
  }
});

// 1. PRODUCER: Queue a new repo ingestion job
app.post('/index', async (req, res) => {
  try {
    const url = req.body?.url;
    if (typeof url !== 'string' || !url.includes('github.com')) {
      res.status(400).json({
        error: 'Send JSON: { "url": "https://github.com/..." }',
      });
      return;
    }

    // Push job to Redis queue (takes ~5 milliseconds!)
    const job = await ingestQueue.add('index-repo', {
      repoUrl: url.trim(),
    });

    console.log(`📥 [API] Enqueued job ${job.id} for ${url.trim()}`);

    // Return 202 Accepted immediately
    res.status(202).json({
      ok: true,
      message: 'Indexing job enqueued successfully.',
      jobId: job.id,
    });
  } catch (err) {
    console.error('Failed to queue job:', err);
    res.status(500).json({ error: 'Failed to queue ingestion job' });
  }
});

// 2. CONSUMER STATUS: Polled by UI for live progress
app.get('/index/status/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    const job = await ingestQueue.getJob(jobId);

    if (!job) {
      res.status(404).json({ error: 'Job not found' });
      return;
    }

    const state = await job.getState(); // 'waiting' | 'active' | 'completed' | 'failed'

    res.json({
      id: job.id,
      state,
      progress: job.progress || { percent: 0, message: 'Waiting in queue...' },
      result: job.returnvalue,
      failedReason: job.failedReason,
    });
  } catch (err) {
    console.error('Failed to get job status:', err);
    res.status(500).json({ error: 'Failed to retrieve job status' });
  }
});

app.listen(PORT, () => {
  console.log(`CodeLens API running on http://localhost:${PORT}`);
});