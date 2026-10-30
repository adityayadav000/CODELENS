BEGIN;

ALTER TABLE code_chunks
    ALTER COLUMN embedding TYPE vector(384);

    COMMIT;