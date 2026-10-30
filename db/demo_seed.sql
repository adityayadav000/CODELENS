BEGIN;

WITH inserted_repository AS (
  INSERT INTO repositories (
    github_repo_id,
    full_name,
    clone_url,
    default_branch,
    status
  )
  VALUES (
    123456789,
    'demo/hello-code',
    'https://github.com/demo/hello-code.git',
    'main',
    'READY'
  )
  RETURNING id
),
inserted_commit AS (
  INSERT INTO commits (
    repository_id,
    sha,
    message,
    committed_at,
    indexed_at
  )
  SELECT
    id,
    'demo-commit-001',
    'Add greeting function',
    now(),
    now()
  FROM inserted_repository
  RETURNING id
)
INSERT INTO code_chunks (
  commit_id,
  path,
  symbol_name,
  kind,
  start_line,
  end_line,
  content,
  content_hash
)
SELECT
  id,
  'src/greeting.ts',
  'greet',
  'FUNCTION',
  1,
  3,
  $code$
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
$code$,
  'demo-greeting-v1'
FROM inserted_commit;

COMMIT;