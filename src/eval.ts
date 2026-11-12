import 'dotenv/config';
import { sql } from './db.js';
import { getEmbedding } from './embed.js';

interface BenchmarkQuery {
  question: string;
  expectedFile: string;
  expectedSymbol?: string;
}

// 1. Ground Truth Benchmark Dataset
const BENCHMARK_DATASET: BenchmarkQuery[] = [
  {
    question: 'how does user login authentication work?',
    expectedFile: 'user.controller.js',
    expectedSymbol: 'loginUser',
  },
  {
    question: 'where are user routes registered?',
    expectedFile: 'user.routes.js',
  },
  {
    question: 'how to register or sign up a new user?',
    expectedFile: 'user.controller.js',
    expectedSymbol: 'registerUser',
  },
  {
    question: 'is plain object check implementation',
    expectedFile: 'index.js',
    expectedSymbol: 'isPlainObject',
  },
];

interface StrategyResult {
  name: string;
  mrr: number;
  recallAt1: number;
  recallAt5: number;
  avgLatencyMs: number;
}

async function evaluateStrategy(
  name: string,
  searchFn: (q: string) => Promise<{ path: string; symbol_name: string | null }[]>,
): Promise<StrategyResult> {
  let reciprocalRankSum = 0;
  let hitsAt1 = 0;
  let hitsAt5 = 0;
  let totalLatency = 0;

  for (const item of BENCHMARK_DATASET) {
    const start = performance.now();
    const results = await searchFn(item.question);
    const duration = performance.now() - start;
    totalLatency += duration;

    // Find the rank of the first relevant chunk
    let rank = 0;
    for (let i = 0; i < results.length; i++) {
      const res = results[i]!;
      const fileMatch = res.path.toLowerCase().includes(item.expectedFile.toLowerCase());
      const symbolMatch = item.expectedSymbol
        ? res.symbol_name?.toLowerCase() === item.expectedSymbol.toLowerCase()
        : true;

      if (fileMatch && symbolMatch) {
        rank = i + 1;
        break;
      }
    }

    if (rank === 1) hitsAt1++;
    if (rank > 0 && rank <= 5) {
      hitsAt5++;
      reciprocalRankSum += 1 / rank;
    }
  }

  const n = BENCHMARK_DATASET.length;
  return {
    name,
    mrr: Number((reciprocalRankSum / n).toFixed(3)),
    recallAt1: Number(((hitsAt1 / n) * 100).toFixed(1)),
    recallAt5: Number(((hitsAt5 / n) * 100).toFixed(1)),
    avgLatencyMs: Number((totalLatency / n).toFixed(1)),
  };
}

async function runEvaluation() {
  console.log('📊 Starting CodeLens Academic Benchmark Evaluation...\n');

  // Strategy 1: Keyword-Only Search
  const keywordResults = await evaluateStrategy('Keyword-Only (FTS)', async (q) => {
    return await sql`
      SELECT c.path, c.symbol_name
      FROM code_chunks c
      ORDER BY ts_rank(coalesce(c.content_tsv, to_tsvector('english', c.content)), plainto_tsquery('english', ${q})) DESC NULLS LAST
      LIMIT 5
    `;
  });

  // Strategy 2: Vector-Only Search
  const vectorResults = await evaluateStrategy('Vector-Only (MiniLM)', async (q) => {
    const emb = await getEmbedding(q);
    return await sql`
      SELECT c.path, c.symbol_name
      FROM code_chunks c
      WHERE c.embedding IS NOT NULL
      ORDER BY (1 - (c.embedding <=> ${JSON.stringify(emb)}::vector)) DESC
      LIMIT 5
    `;
  });

  // Strategy 3: CodeLens Hybrid Search (70% Vector + 30% Keyword)
  const hybridResults = await evaluateStrategy('CodeLens Hybrid Search', async (q) => {
    const emb = await getEmbedding(q);
    return await sql`
      SELECT c.path, c.symbol_name
      FROM code_chunks c
      WHERE c.embedding IS NOT NULL
      ORDER BY
        (1 - (c.embedding <=> ${JSON.stringify(emb)}::vector)) * 0.7
        + coalesce(ts_rank(coalesce(c.content_tsv, to_tsvector('english', c.content)), plainto_tsquery('english', ${q})), 0) * 0.3
        DESC NULLS LAST
      LIMIT 5
    `;
  });

  // Generate Academic Markdown Table
  console.log('\n### CodeLens Retrieval Benchmark Results (Ablation Study)\n');
  console.log('| Search Strategy | Recall@1 (%) | Recall@5 (%) | MRR (Mean Reciprocal Rank) | Avg Latency (ms) |');
  console.log('|---|---|---|---|---|');

  [keywordResults, vectorResults, hybridResults].forEach((r) => {
    console.log(`| **${r.name}** | ${r.recallAt1}% | ${r.recallAt5}% | **${r.mrr}** | ${r.avgLatencyMs} ms |`);
  });

  console.log('\n✅ Benchmark evaluation completed.');
  await sql.end();
}

runEvaluation().catch(console.error);