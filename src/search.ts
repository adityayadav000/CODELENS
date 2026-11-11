import { sql } from './db.js';
import { getEmbedding } from './embed.js';

export async function searchChunks(question: string) {
  // Step 1: Convert the user's question into a 384-d vector
  const questionEmbedding = await getEmbedding(question);

  // Step 2: Run hybrid search (Semantic Vector + Full-Text Search)
  const rows = await sql`
    SELECT
      path,
      symbol_name,
      kind,
      start_line,
      end_line,
      content,   
      left(content, 300) AS content_preview, 
      
      -- Vector Cosine Similarity (Meaning Score)
      1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
      
      -- Full-Text Keyword Score (with fallback so it never returns NULL)
      coalesce(
        ts_rank(
          coalesce(content_tsv, to_tsvector('english', content)),
          plainto_tsquery('english', ${question})
        ),
        0
      ) AS keyword_score

    FROM code_chunks
    WHERE embedding IS NOT NULL

    -- Combine 70% semantic meaning + 30% exact keywords
    ORDER BY
      (1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector)) * 0.7
      + coalesce(
          ts_rank(
            coalesce(content_tsv, to_tsvector('english', content)),
            plainto_tsquery('english', ${question})
          ),
          0
        ) * 0.3
      DESC NULLS LAST
    LIMIT 5
  `;

  return rows;
}