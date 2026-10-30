import { sql } from './db.js';
import { getEmbedding } from './embed.js';

export async function searchChunks(question: string) {
  const questionEmbedding = await getEmbedding(question);

  const rows = await sql`
    SELECT
      path,
      symbol_name,
      kind,
      start_line,
      end_line,
      left(content, 300) AS content_preview,
      1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
      ts_rank(content_tsv, plainto_tsquery('english', ${question})) AS keyword_score
    FROM code_chunks
    WHERE embedding IS NOT NULL
    ORDER BY
      (1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector)) * 0.7
      + ts_rank(content_tsv, plainto_tsquery('english', ${question})) * 0.3
      DESC
    LIMIT 5
  `;

  return rows;
}