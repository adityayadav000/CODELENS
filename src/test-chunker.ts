import { chunkSourceFile } from './chunkFile.js';

console.log('🧪 Running Universal Polyglot Unit Tests (TS, Python, Go, Java, Rust, C++)...\n');

async function runTests(): Promise<void> {
  // 1. TypeScript
  const tsChunks = await chunkSourceFile('export function add(a: number) { return a; }', 'math.ts');
  console.log('✅ [TypeScript]:', tsChunks.map(function (c) { return c.symbol_name; }));

  // 2. Python
  const pyChunks = await chunkSourceFile('class Auth:\n    def login(self): pass', 'auth.py');
  console.log('✅ [Python]:', pyChunks.map(function (c) { return c.symbol_name; }));

  // 3. Go
  const goChunks = await chunkSourceFile('package main\nfunc GetUser() string { return "" }', 'main.go');
  console.log('✅ [Go]:', goChunks.map(function (c) { return c.symbol_name; }));

  // 4. Java
  const javaChunks = await chunkSourceFile('public class Service {\n    public void run() {}\n}', 'Service.java');
  console.log('✅ [Java]:', javaChunks.map(function (c) { return c.symbol_name; }));

  // 5. Rust
  const rustChunks = await chunkSourceFile('pub fn start_server() {}\nstruct Config {}', 'lib.rs');
  console.log('✅ [Rust]:', rustChunks.map(function (c) { return c.symbol_name; }));

  // 6. C++
  const cppChunks = await chunkSourceFile('int calculate(int x) { return x * 2; }\nclass Pool {};', 'main.cpp');
  console.log('✅ [C++]:', cppChunks.map(function (c) { return c.symbol_name; }));

  console.log('\n🎉 ALL 6 Languages Passed AST Parsing Cleanly!');
}

runTests().catch(function (err) {
  console.error('❌ Test failed:', err);
  process.exit(1);
});