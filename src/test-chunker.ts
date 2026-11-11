import { chunkSourceFile } from './chunkFile.js';

console.log('🧪 Running Unit Tests: Code Chunking Engine...\n');

// Sample code with 2 functions
const sampleCode = `
export function add(a: number, b: number): number {
  return a + b;
}

export async function loginUser(req: any, res: any) {
  const { email, password } = req.body;
  return res.json({ token: "fake-jwt" });
}
`;

const chunks = chunkSourceFile(sampleCode);

// Verification assertions
if (chunks.length < 2) {
  console.error(`❌ Test Failed: Expected at least 2 chunks, but got ${chunks.length}`);
  process.exit(1);
}

const names = chunks.map((c) => c.symbol_name);
if (!names.includes('add') || !names.includes('loginUser')) {
  console.error(`❌ Test Failed: Expected chunks 'add' and 'loginUser', got:`, names);
  process.exit(1);
}

console.log('✅ Test 1 Passed: Identified all function chunks correctly:');
chunks.forEach((c) => {
  console.log(`   - [${c.kind}] ${c.symbol_name} (lines ${c.start_line}-${c.end_line})`);
});

console.log('\n🎉 All Unit Tests Passed cleanly!');
process.exit(0);