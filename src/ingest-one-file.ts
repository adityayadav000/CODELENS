import 'dotenv/config';
import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import postgres from 'postgres';
import { pipeline } from '@xenova/transformers';

const databaseUrl = process.env.DATABASE_URL;

if(databaseUrl == undefined) {
    throw new Error('DATABASE_URL is missing. add it to your .env file.');

}

const sql= postgres(databaseUrl, {max: 1});

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getEmbedding(text: string): Promise<number[]> {

    if(embedder === null) {
        console.log('loading embedding model (first time only )...');
        embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2' );

    }

    const output = await embedder(text, {
        pooling: 'mean',
        normalize: true as any,
    } as any);

 const tensor = output as { data: Float32Array };

  return Array.from(tensor.data);

}

async function main() {
  
    const [repo] = await sql`
        INSERT INTO repositories (
        github_repo_id,
        full_name,
        clone_url,
        default_branch,
        status
        ) VALUES (
      50748809,
      'sindresorhus/escape-string-regexp',
      'https://github.com/sindresorhus/escape-string-regexp.git',
      'main',
      'READY'
    )
      ON CONFLICT (github_repo_id) DO UPDATE
  SET
    full_name = EXCLUDED.full_name,
    clone_url = EXCLUDED.clone_url,
    default_branch = EXCLUDED.default_branch,
    updated_at = now()
    RETURNING id, full_name
  `;

    if (!repo) {
        throw new Error('Failed to insert repository');
    }

    console.log('Inserted repository:', repo);

    const [commit] = await sql`
        INSERT INTO commits (
            repository_id,
            sha,
            message,
            committed_at,
            indexed_at
        ) VALUES (
         ${repo.id},  
         'demo-escape-string-regexp-001',
            'Index escape-string-regexp',
            now(),
            now()
        )
            ON CONFLICT (repository_id, sha) DO UPDATE
            SET
            message = EXCLUDED.message,
            indexed_at = now()
            RETURNING id, sha
        `;

    if (!commit) {
        throw new Error('Failed to insert commit.');
    }

    console.log('Inserted commit:', commit);

     const filestoIndex= ['index.js', 'test.js'];

     for(const fileName of filestoIndex){
        const fullPath = path.join(
            process.cwd(),
            'local-repos',
            'escape-string-regexp',
            fileName
        );
        const content =await readFile(fullPath, 'utf8');
        const contentHash=createHash('sha256'). update(content).digest('hex');
        const embedding = await getEmbedding(content);
        console.log('-----');
        console.log('File:', fileName);
        console.log('Full path:', fullPath);
        console.log('Content length:', content.length);
        console.log('Content hash:', contentHash);
        console.log('embedding length: ' , embedding.length);
     
    const [chunk] = await sql`
    INSERT INTO code_chunks (
      commit_id,
      path,
      symbol_name,
      kind,
      start_line,
      end_line,
      content,
      content_hash,
      embedding
    ) VALUES (
      ${commit.id},
      ${fileName},
      null,          -- main export name
      'MODULE',
      1,
      ${content.split('\n').length},
      ${content},
      ${contentHash},
      ${JSON.stringify(embedding)}
    )
      ON CONFLICT (commit_id, path, kind, start_line, end_line) DO UPDATE
        SET
    content = EXCLUDED.content,
    content_hash = EXCLUDED.content_hash,
    symbol_name = EXCLUDED.symbol_name,
    embedding= EXCLUDED.embedding
    RETURNING id, path, kind, start_line, end_line
  `;

  console.log('Inserted code_chunk:', chunk);
}

}
main()
    .catch(function(err){
        console.error(err);
        process.exit(1);

    })
    .finally(async function(){
        await sql.end();
    });