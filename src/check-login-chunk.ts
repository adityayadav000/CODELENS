import 'dotenv/config';
import postgres from 'postgres';
import { getEmbedding } from './embed.js';

const sql = postgres(process.env.DATABASE_URL!, { max: 1 });

const question = 'how does login work?';
const questionEmbedding = await getEmbedding(question);

console.log('Testing search with COALESCE:');
const rows = await sql`
  SELECT
    c.path,
    c.symbol_name,
    1 - (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
    coalesce(ts_rank(c.content_tsv, plainto_tsquery('english', ${question})), 0) AS keyword_score,
    (1 - (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector)) * 0.7
      + coalesce(ts_rank(c.content_tsv, plainto_tsquery('english', ${question})), 0) * 0.3 AS total_score
  FROM code_chunks c
  WHERE c.embedding IS NOT NULL
  ORDER BY total_score DESC NULLS LAST
  LIMIT 5
`;

console.log(rows.map(r => ({
  path: r.path,
  symbol_name: r.symbol_name,
  meaning: r.meaning_score,
  keyword: r.keyword_score,
  total: r.total_score
})));

await sql.end();


