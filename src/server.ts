import express from 'express';
import process from 'node:process';
import { searchChunks } from './search.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { critiqueAnswer } from './critic.js';

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

app.post('/ask', async (req, res) => {
  try {
    const question = req.body?.question;

    if (typeof question !== 'string' || question.trim() === '') {
      res.status(400).json({
        error: 'Send JSON: { "question": "your question" }',
      });
      return;
    }

    const rows = await searchChunks(question.trim());

    const citations = rows.map((row) => ({
      path: row.path,
      start_line: row.start_line,
      end_line: row.end_line,
      kind: row.kind,
      meaning_score: row.meaning_score,
      keyword_score: row.keyword_score,
      preview: row.content_preview,
    }));

    const answer =
      rows.length === 0
        ? 'I could not find relevant code for this question.'
        : `Based on the indexed code, the most relevant files are: ${rows
            .map((r) => `${r.path} (lines ${r.start_line}-${r.end_line})`)
            .join(', ')}. See citations for evidence.`;

      let critic = {
      pass: false,
      notes: 'FALLBACK: critic did not run',
    };
    
      try{
      critic = await critiqueAnswer(
      question.trim(),
      answer,
      rows.map((row) => ({
        path: String(row.path),
        start_line: Number(row.start_line),
        end_line: Number(row.end_line),
        content_preview: String(row.content_preview ?? ''),
      })),
    ); 
  }catch (err){
    console.error('Critic failed:', err);
      critic = {
        pass: false,
        notes: 'FALLBACK: ' + (err instanceof Error ? err.message : String(err)),
      };
  }    
  console.log('Sending critic to client:', critic);
    res.json({
      question,
      answer,
      citations,
      critic, // { pass: boolean, notes: string }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong while answering.' });
  }
});

app.listen(PORT, () => {
  console.log(`CodeLens API running on http://localhost:${PORT}`);
});