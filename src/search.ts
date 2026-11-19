import { sql } from './db.js';
import { getEmbedding } from './embed.js';

export async function searchChunks(question: string, repoId?: string) {
  // 1. Convert question to a 384-dimensional vector
  const questionEmbedding = await getEmbedding(question);

  // 2. Build the repository filter
  const repoFilter = repoId ? sql`cm.repository_id = ${repoId}` : sql`TRUE`;

  // 3. Reciprocal Rank Fusion (RRF) — combine RANK positions, not raw scores
  //
  //    WHY: Vector scores (0.0–1.0) and ts_rank scores (0.0–0.06) are on
  //    completely different scales. Adding them directly causes keyword noise
  //    to drag down strong vector matches.
  //
  //    RRF fixes this by converting each score into a rank (1st, 2nd, 3rd...),
  //    then combining ranks:  1/(60 + rank_vector) + 1/(60 + rank_keyword)
  //
  //    The constant 60 is from the original RRF paper (Cormack et al., 2009).
  //    A chunk that ranks #1 in vector but has zero keyword match still scores
  //    highly — keywords can only BOOST, never HURT.

  const rows = await sql`
    WITH vector_ranked AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (
          ORDER BY (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) ASC
        ) AS v_rank
      FROM code_chunks c
      JOIN commits cm ON c.commit_id = cm.id
      WHERE c.embedding IS NOT NULL
        AND ${repoFilter}
        AND cm.id = (
          SELECT id FROM commits
          WHERE repository_id = cm.repository_id
          ORDER BY created_at DESC
          LIMIT 1
        )
    ),

    keyword_ranked AS (
      SELECT
        c.id,
        ROW_NUMBER() OVER (
          ORDER BY ts_rank(
            coalesce(c.content_tsv, to_tsvector('english', c.content)),
            plainto_tsquery('english', ${question})
          ) DESC
        ) AS k_rank
      FROM code_chunks c
      JOIN commits cm ON c.commit_id = cm.id
      WHERE ${repoFilter}
        AND cm.id = (
          SELECT id FROM commits
          WHERE repository_id = cm.repository_id
          ORDER BY created_at DESC
          LIMIT 1
        )
    )

    SELECT
      c.path,
      c.symbol_name,
      c.kind,
      c.start_line,
      c.end_line,
      c.content,
      left(c.content, 300) AS content_preview,
      r.full_name AS repo_name,

      -- Raw scores (for the UI citation cards)
      1 - (c.embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
      coalesce(
        ts_rank(
          coalesce(c.content_tsv, to_tsvector('english', c.content)),
          plainto_tsquery('english', ${question})
        ), 0
      ) AS keyword_score

    FROM code_chunks c
    JOIN commits cm ON c.commit_id = cm.id
    JOIN repositories r ON cm.repository_id = r.id
    JOIN vector_ranked vr ON vr.id = c.id
    JOIN keyword_ranked kr ON kr.id = c.id

    ORDER BY
      (1.0 / (20 + vr.v_rank)) + (1.0 / (120 + kr.k_rank)) DESC
  
    LIMIT 5
  `;

  return rows;
}