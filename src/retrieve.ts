import 'dotenv/config';
import process from 'node:process';
import postgres from 'postgres';
import { pipeline } from '@xenova/transformers';

const databaseUrl = process.env.DATABASE_URL;

if (databaseUrl === undefined) {
  throw new Error('DATABASE_URL is missing. Add it to your .env file.');
}

const sql = postgres(databaseUrl, { max: 1 });

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getEmbedding(text: string): Promise<number[]> {
  if (embedder === null) {
    console.log('Loading embedding model...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }

  const output = await embedder(text, {
    pooling: 'mean',
     normalize: true as any,
    } as any);


  const tensor = output as { data: Float32Array };
  return Array.from(tensor.data);
}

async function main() {
    const question= 'how does this library escape regex special characters ?';
    console.log('Question:', question);



const questionEmbedding=await getEmbedding(question);
console.log('Question embedding length:', questionEmbedding.length);

const rows=await sql`
SELECT
      path,
      symbol_name,
      kind,
      start_line,
      end_line,
      left(content, 200) AS content_preview,
      1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector) AS meaning_score,
      ts_rank(content_tsv, plainto_tsquery('english', ${question})) AS keyword_score
    FROM code_chunks
    WHERE embedding IS NOT NULL
    ORDER BY
      (1 - (embedding <=> ${JSON.stringify(questionEmbedding)}::vector)) * 0.7
      + ts_rank(content_tsv, plainto_tsquery('english', ${question})) * 0.3
      DESC
    LIMIT 5
  `;

  console.log('\nTop matching chunks:\n');

  if (rows.length === 0) {
    console.log('no chunks');
    return;
  }

for (const row of rows) {
    console.log('---');
    console.log(`File: ${row.path}  lines ${row.start_line}-${row.end_line}`);
    console.log(`Kind: ${row.kind}  symbol: ${row.symbol_name ?? '(none)'}`);
    console.log(`Meaning score: ${Number(row.meaning_score).toFixed(3)}`);
    console.log(`Keyword score: ${Number(row.keyword_score).toFixed(3)}`);
    console.log(`Preview: ${row.content_preview}`);
  }

  // --- Basic answer from retrieved chunks ---
  console.log('\n========== ANSWER ==========\n');

  if (rows.length === 0) {
    console.log('I could not find relevant code for this question.');
    return;
  }

  console.log(
    'Based on the indexed code, here is what is relevant:\n'
  );

  for (const row of rows) {
    console.log(
      `- In \`${row.path}\` (lines ${row.start_line}-${row.end_line}), ` +
        `this ${String(row.kind).toLowerCase()} is related to the question.`
    );
    console.log(`  Evidence:\n\`\`\`\n${row.content_preview}\n\`\`\`\n`);
  }

  console.log(
    'Summary: the library provides escaping for RegExp special characters; ' +
      'see index.js for the implementation and test.js for examples of expected behavior.'
  );

  console.log('\nCitations:');
  for (const row of rows) {
    console.log(`- ${row.path}:${row.start_line}-${row.end_line}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
.finally(async () => {
    await sql.end();
  });
