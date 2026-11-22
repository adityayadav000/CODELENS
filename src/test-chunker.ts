import { chunkSourceFile } from './chunkFile.js';

console.log('🧪 Running Comprehensive Unit Tests: AST Code Chunking Engine...\n');

const comprehensiveCode = `
export function add(a: number, b: number): number {
  return a + b;
}

exports.loginUser = async function(req: any, res: any) {
  return res.json({ token: "jwt-token" });
};

router.post('/api/auth/register', function(req: any, res: any) {
  res.send('registered');
});

export class UserService {
  async findById(id: string) {
    return { id };
  }
}

export function Button(props: { label: string }) {
  return <button className="btn">{props.label}</button>;
}
`;

const chunks = chunkSourceFile(comprehensiveCode, 'component.tsx');

console.log(`Discovered ${chunks.length} AST code chunks:`);
for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i];
  if (c) {
    console.log(`   - [${c.kind}] ${c.symbol_name} (lines ${c.start_line}-${c.end_line})`);
  }
}

// Verification assertions
const symbols = chunks.map(function(c) { return c.symbol_name; });

if (!symbols.includes('add')) {
  console.error('❌ Test Failed: Missing ES export function "add"');
  process.exit(1);
}

if (!symbols.includes('loginUser')) {
  console.error('❌ Test Failed: Missing CommonJS export "loginUser"');
  process.exit(1);
}

if (!symbols.includes('router.post(/api/auth/register)')) {
  console.error('❌ Test Failed: Missing Express route registration "router.post(/api/auth/register)"');
  process.exit(1);
}

if (!symbols.includes('UserService.findById')) {
  console.error('❌ Test Failed: Missing class method "UserService.findById"');
  process.exit(1);
}

if (!symbols.includes('Button')) {
  console.error('❌ Test Failed: Missing TSX component "Button"');
  process.exit(1);
}

console.log('\n🎉 All 5 AST Chunking Unit Tests Passed Cleanly!');
process.exit(0);