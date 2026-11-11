export type CodeChunkPiece = {
  symbol_name: string | null;
  kind: 'FUNCTION' | 'CLASS' | 'MODULE';
  start_line: number;
  end_line: number;
  content: string;
};

/**
 * Split JS/TS source into function/class chunks (simple regex approach).
 * Not a full parser — good enough for demos. Falls back to whole file.
 */
export function chunkSourceFile(source: string): CodeChunkPiece[] {
  const lines = source.split('\n');
  if (lines.length === 0) {
    return [];
  }

  // Matches common patterns, e.g.:
  // export default function name
  // export function name
  // function name
  // export class Name
  // class Name
  // const name = ( or const name = function
  const startRe =
  /^\s*(?:export\s+(?:default\s+)?)?(?:async\s+)?(function\s+([A-Za-z0-9_]+)|class\s+([A-Za-z0-9_]+)|(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)\s*=>|function\b))/;
  const starts: { line: number; name: string; kind: 'FUNCTION' | 'CLASS' }[] =
    [];

  for (let i = 0; i < lines.length; i++) {
   const line = lines[i];
if (!line) continue;

const m = line.match(startRe);
    if (!m) continue;

    if (m[2]) {
      starts.push({ line: i, name: m[2], kind: 'FUNCTION' });
    } else if (m[3]) {
      starts.push({ line: i, name: m[3], kind: 'CLASS' });
    } else if (m[4]) {
      starts.push({ line: i, name: m[4], kind: 'FUNCTION' });
    }
  }

  // Nothing found → one MODULE chunk (old behavior)
  if (starts.length === 0) {
    return [
      {
        symbol_name: null,
        kind: 'MODULE',
        start_line: 1,
        end_line: lines.length,
        content: source,
      },
    ];
  }

  const pieces: CodeChunkPiece[] = [];

 for (let s = 0; s < starts.length; s++) {
  const current = starts[s];
  if (!current) continue;

  const next = starts[s + 1];

  const from = current.line;
  const to = next ? next.line - 1 : lines.length - 1;

  const slice = lines.slice(from, to + 1).join('\n');

  pieces.push({
    symbol_name: current.name,
    kind: current.kind,
    start_line: from + 1,
    end_line: to + 1,
    content: slice,
  });
}

  return pieces;
}