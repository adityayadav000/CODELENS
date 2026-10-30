BEGIN;

    CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
    ON code_chunks
    using hnsw (embedding vector_cosine_ops);

    ALTER TABLE code_chunks
     ADD COLUMN IF NOT EXISTS content_tsv tsvector
     GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;
     
     CREATE INDEX IF NOT EXISTS code_chunks_content_tsv_idx
      On code_chunks
      Using GIN (content_tsv);

      commit;