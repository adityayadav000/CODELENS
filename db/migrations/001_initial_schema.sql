    BEGIN;
    CREATE EXTENSION IF NOT EXISTS  vector;
    CREATE EXTENSION IF NOT EXISTS  pgcrypto;

    CREATE TYPE repository_status AS ENUM (
        'PENDING' ,
        'INDEXING' ,
        'READY' ,
        'FAILED'
    
    );

    CREATE TYPE code_chunk_kind AS ENUM (
        'FUNCTION',
        'METHOD',
        'CLASS',
        'MODULE'
    );

    CREATE TYPE dependency_kind AS ENUM (
        'CALLS',
        'IMPORTS',
        'EXTENDS',
        'IMPLEMENTS'
    );

    CREATE TABLE repositories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        github_repo_id BIGINT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        clone_url TEXT NOT NULL,
        default_branch TEXT NOT NULL,
        status repository_status NOT NULL DEFAULT 'PENDING',
        last_indexed_commit_sha TEXT,
        created_at TIMESTAMPTz NOT NULL DEFAULT now(),  
        updated_at TIMESTAMPTz NOT NULL DEFAULT now()
    );

    CREATE TABLE commits (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        repository_id UUID NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
        sha TEXT NOT NULL,
        parent_sha TEXT,
        message TEXT NOT NULL DEFAULT '',
        committed_at TIMESTAMPTZ NOT NULL,
        indexed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (repository_id, sha)

    ); 
    
    
    CREATE TABLE code_chunks (

        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        commit_id UUID NOT NULL REFERENCES commits(id) ON DELETE CASCADE,
        path TEXT NOT NULL ,
        symbol_name TEXT,
        kind code_chunk_kind NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        embedding vector(1536),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT code_chunks_valid_line_range
            CHECK (start_line > 0 AND end_line >= start_line),

            unique (commit_id, path,kind,start_line, end_line)
            
    );  

    CREATE TABLE chunk_dependencies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        from_chunk_id UUID NOT NULL REFERENCES code_chunks(id) ON DELETE CASCADE,
        to_chunk_id UUID NOT NULL REFERENCES code_chunks(id) ON DELETE CASCADE,
        kind dependency_kind NOT NULL,
        confidence REAL NOT NULL DEFAULT 1.0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

        CONSTRAINT chunk_dependencies_no_self_reference
            CHECK (from_chunk_id <> to_chunk_id),

        CONSTRAINT chunk_dependencies_valid_confidence
            CHECK (confidence >= 0 AND confidence <= 1),

        UNIQUE (from_chunk_id, to_chunk_id, kind)
    );

    CREATE INDEX commits_repository_id_idx
        ON commits (repository_id);

    CREATE INDEX code_chunks_commit_id_idx
      ON code_chunks (commit_id);

    CREATE INDEX code_chunks_commit_path_idx
        ON code_chunks (commit_id, path);

    CREATE INDEX chunk_dependencies_from_chunk_id_idx
        ON chunk_dependencies (from_chunk_id);

    CREATE INDEX chunk_dependencies_to_chunk_id_idx
        ON chunk_dependencies (to_chunk_id);

    COMMIT;