import { sql } from './db.js';
import { getEmbedding } from './embed.js';

export async function searchChunks(question: string, repoId?: string) {
  // 1. Convert question to a 384-dimensional vector
  const questionEmbedding = await getEmbedding(question);

  // 2. Build the repository filter:
  // If repoId exists, filter by it. If not, match everything (TRUE).
  const repoFilter = repoId ? sql`cm.repository_id = ${repoId}` : sql`TRUE`;

  // 3. Run Hybrid Search with repository filtering
  const rows = await sql`
    SELECT
      c.path,
      c.symbol_name,
      c.kind,
      c.start_line,
      c.end_line,
      c.content,
      left(c.content, 300) AS content_preview,
      r.full_name AS repo_name,
      
      -- Vector Cosine Similarity
      1 - (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
      
      -- Full-Text Keyword Score (with fallback so it never returns NULL)
      coalesce(
        ts_rank(
          coalesce(c.content_tsv, to_tsvector('english', c.content)),
          plainto_tsquery('english', ${question})
        ),
        0
      ) AS keyword_score

    FROM code_chunks c
    JOIN commits cm ON c.commit_id = cm.id
    JOIN repositories r ON cm.repository_id = r.id
    WHERE c.embedding IS NOT NULL
      AND ${repoFilter}
  
      AND cm.id = (
        SELECT id FROM commits 
        WHERE repository_id = r.id 
        ORDER BY created_at DESC 
        LIMIT 1
      )
    ORDER BY
      (1 - (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector)) * 0.7
      + coalesce(
          ts_rank(
            coalesce(c.content_tsv, to_tsvector('english', c.content)),
            plainto_tsquery('english', ${question})
          ),
          0
        ) * 0.3
      DESC NULLS LAST
    LIMIT 5
  `;

  return rows;
}