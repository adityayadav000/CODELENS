// Clone a repo and store code chunks + embeddings in Postgres
import 'dotenv/config';
import process from 'node:process';
import path from 'node:path';
import { mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sql } from './db.js';
import { getEmbedding } from './embed.js';
import { chunkSourceFile } from './chunkFile.js';
import type { IngestJobProgress } from './queue.js';

// execFile uses callbacks; promisify lets us use await
const execFileAsync = promisify(execFile);

// Skip very large files (memory / embedding cost)
const MAX_FILE_BYTES = 200_000;

// Only these extensions are treated as source code
const CODE_EXT = new Set(['.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs']);

export type ProgressCallback = (progress: IngestJobProgress) => Promise<void> | void;

/** ".../is-plain-obj.git" → "is-plain-obj" */
function repoNameFromUrl(url: string): string {
  const cleaned = url.replace(/\.git$/, '').replace(/\/$/, '');
  const parts = cleaned.split('/');
  return parts[parts.length - 1] || 'repo';
}

/**
 * Build a stable positive id from the URL so ON CONFLICT works.
 * Uses 7 hex chars so the number fits Postgres INTEGER safely.
 */
function githubIdFromUrl(url: string): number {
  const hex = createHash('sha256').update(url).digest('hex').slice(0, 7);
  return parseInt(hex, 16);
}

/**
 * Walk a folder tree and return full paths of code files.
 * Skips node_modules, .git, dist, build, coverage.
 */
async function listCodeFiles(dir: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(current: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (err) {
      console.error('Cannot read dir:', current, err);
      return;
    }

    for (const entry of entries) {
      const full = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name === 'coverage'
        ) {
          continue; // do not enter these folders
        }
        await walk(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (CODE_EXT.has(ext)) {
          out.push(full);
        }
      }
    }
  }

  await walk(dir);
  return out;
}

export async function ingestRepoFromUrl(
  repoUrl: string,
  onProgress?: ProgressCallback,
): Promise<{ filesIndexed: number; chunksIndexed: number }> {
  // Fail fast if DB URL missing
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is missing. Add it to .env');
  }

  const name = repoNameFromUrl(repoUrl);
  const localRoot = path.join(process.cwd(), 'local-repos', name);

  console.log('Repo URL:', repoUrl);
  console.log('Local path:', localRoot);

  // 1. Report Progress: Starting Clone
  await onProgress?.({
    stage: 'cloning',
    percent: 10,
    message: `Cloning repository ${name}...`,
  });

  // ----- Clone only if folder does not exist -----
  let exists = true;
  try {
    await stat(localRoot);
  } catch {
    exists = false;
  }

  if (!exists) {
    await mkdir(path.join(process.cwd(), 'local-repos'), { recursive: true });
    console.log('Cloning (shallow)...');
    try {
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, localRoot], {
        windowsHide: true,
      });
    } catch (err) {
      console.error('git clone failed. Is git installed and on PATH?');
      throw err;
    }
  } else {
    console.log('Folder already exists — skip clone');
  }

  // ----- repositories row (upsert by github_repo_id) -----
  const githubRepoId = githubIdFromUrl(repoUrl);

  const [repo] = await sql`
    INSERT INTO repositories (
      github_repo_id,
      full_name,
      clone_url,
      default_branch,
      status
    ) VALUES (
      ${githubRepoId},
      ${'local/' + name},
      ${repoUrl},
      ${'main'},
      ${'READY'}
    )
    ON CONFLICT (github_repo_id) DO UPDATE SET
      full_name = EXCLUDED.full_name,
      clone_url = EXCLUDED.clone_url,
      updated_at = now()
    RETURNING id, full_name
  `;

  if (!repo) {
    throw new Error('Failed to insert repository');
  }

  // ----- commits row = one indexed snapshot -----
  const [commit] = await sql`
    INSERT INTO commits (
      repository_id,
      sha,
      message,
      committed_at,
      indexed_at
    ) VALUES (
      ${repo.id},
      ${'ingest-' + name + '-' + Date.now()},
      ${'Ingest ' + name},
      now(),
      now()
    )
    RETURNING id, sha
  `;

  if (!commit) {
    throw new Error('Failed to insert commit');
  }

  // ----- Discover source files -----
  const files = await listCodeFiles(localRoot);
  console.log('Code files found:', files.length);

  // 2. Report Progress: Files Discovered
  await onProgress?.({
    stage: 'listing',
    percent: 25,
    message: `Discovered ${files.length} code files to index.`,
    total: files.length,
  });

  if (files.length === 0) {
    console.log('No matching source files. Nothing to index.');
    return { filesIndexed: 0, chunksIndexed: 0 };
  }

  let fileIndex = 0;
  let totalChunks = 0;

  // ----- Each file → chunk → embed → code_chunks -----
  for (const fullPath of files) {
    fileIndex++;
    const rel = path.relative(localRoot, fullPath).split(path.sep).join('/');
    const fileStat = await stat(fullPath);

    if (fileStat.size > MAX_FILE_BYTES) {
      console.log('Skip (too big):', rel);
      continue;
    }

    // 3. Report Progress: Embedding
    const percent = Math.round(25 + (fileIndex / files.length) * 65);
    await onProgress?.({
      stage: 'embedding',
      percent,
      message: `Embedding ${rel} (${fileIndex}/${files.length})`,
      current: fileIndex,
      total: files.length,
    });

    const content = await readFile(fullPath, 'utf8');
    const pieces = chunkSourceFile(content);

    for (const piece of pieces) {
      totalChunks++;
      const contentHash = createHash('sha256')
        .update(piece.content)
        .digest('hex');

      const embedding = await getEmbedding(piece.content);
      const embeddingLiteral = `[${embedding.join(',')}]`;

      await sql`
        INSERT INTO code_chunks (
          commit_id,
          path,
          symbol_name,
          kind,
          start_line,
          end_line,
          content,
          content_tsv,
          content_hash,
          embedding
        ) VALUES (
          ${commit.id},
          ${rel},
          ${piece.symbol_name},
          ${piece.kind},
          ${piece.start_line},
          ${piece.end_line},
          ${piece.content},
          to_tsvector('english', ${piece.content}),
          ${contentHash},
          ${embeddingLiteral}::vector
        )
        ON CONFLICT (commit_id, path, kind, start_line, end_line) DO UPDATE SET
          content = EXCLUDED.content,
          content_tsv = EXCLUDED.content_tsv,
          content_hash = EXCLUDED.content_hash,
          symbol_name = EXCLUDED.symbol_name,
          embedding = EXCLUDED.embedding
      `;
    }
  }

  // 4. Report Progress: Done!
  await onProgress?.({
    stage: 'done',
    percent: 100,
    message: `Done! Indexed ${files.length} files (${totalChunks} chunks).`,
    total: files.length,
  });

  console.log(`Done. Indexed ${files.length} files and ${totalChunks} chunks.`);
  return { filesIndexed: files.length, chunksIndexed: totalChunks };
}

// Run from terminal only: npx tsx src/ingest-repo.ts <url>
const isCli = process.argv[1] && process.argv[1].includes('ingest-repo');

if (isCli) {
  const url =
    process.argv[2] ||
    'https://github.com/sindresorhus/is-plain-obj.git';

  ingestRepoFromUrl(url, (p) => {
    console.log(`[Progress ${p.percent}%] ${p.message}`);
  })
    .then((result) => {
      console.log('Result:', result);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(async () => {
      await sql.end();
    });
}