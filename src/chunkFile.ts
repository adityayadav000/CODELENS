import ts from 'typescript';
import Parser from 'web-tree-sitter';
import path from 'node:path';

export type CodeChunkPiece = {
  symbol_name: string | null;
  kind: 'FUNCTION' | 'METHOD' | 'CLASS' | 'MODULE';
  start_line: number;
  end_line: number;
  content: string;
};

// Tree-sitter Parser singleton & Language cache
let isInitialized = false;
const languageCache: Record<string, Parser.Language> = {};

async function ensureTreeSitterInit(): Promise<void> {
  if (isInitialized) return;
  const wasmPath = path.join(process.cwd(), 'node_modules/web-tree-sitter/tree-sitter.wasm');
  await Parser.init({
    locateFile: function () {
      return wasmPath;
    },
  });
  isInitialized = true;
}

async function getLanguage(langName: string): Promise<Parser.Language> {
  await ensureTreeSitterInit();
  if (languageCache[langName]) {
    return languageCache[langName]!;
  }
  const wasmFile = path.join(process.cwd(), `node_modules/tree-sitter-wasms/out/tree-sitter-${langName}.wasm`);
  const loaded = await Parser.Language.load(wasmFile);
  languageCache[langName] = loaded;
  return loaded;
}

// 1. Python Parser
function chunkPython(tree: Parser.Tree): CodeChunkPiece[] {
  const pieces: CodeChunkPiece[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;

    if (child.type === 'function_definition') {
      const name = child.childForFieldName('name')?.text || 'func';
      pieces.push({
        symbol_name: name,
        kind: 'FUNCTION',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'class_definition') {
      const className = child.childForFieldName('name')?.text || 'Class';
      pieces.push({
        symbol_name: className,
        kind: 'CLASS',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });

      const body = child.childForFieldName('body');
      if (body) {
        for (let j = 0; j < body.namedChildCount; j++) {
          const method = body.namedChild(j);
          if (method && method.type === 'function_definition') {
            const mName = method.childForFieldName('name')?.text || 'method';
            pieces.push({
              symbol_name: `${className}.${mName}`,
              kind: 'METHOD',
              start_line: method.startPosition.row + 1,
              end_line: method.endPosition.row + 1,
              content: method.text,
            });
          }
        }
      }
    }
  }
  return pieces;
}

// 2. Go Parser
function chunkGo(tree: Parser.Tree): CodeChunkPiece[] {
  const pieces: CodeChunkPiece[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;

    if (child.type === 'function_declaration') {
      const name = child.childForFieldName('name')?.text || 'func';
      pieces.push({
        symbol_name: name,
        kind: 'FUNCTION',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'method_declaration') {
      const name = child.childForFieldName('name')?.text || 'method';
      const receiver = child.childForFieldName('receiver');
      const recvText = receiver ? receiver.text.replace(/[()*]/g, '').trim().split(' ')[1] || 'recv' : 'recv';
      pieces.push({
        symbol_name: `${recvText}.${name}`,
        kind: 'METHOD',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'type_declaration') {
      pieces.push({
        symbol_name: child.text.split(' ')[1] || 'Type',
        kind: 'CLASS',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    }
  }
  return pieces;
}

// 3. Java Parser
function chunkJava(tree: Parser.Tree): CodeChunkPiece[] {
  const pieces: CodeChunkPiece[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;

    if (child.type === 'class_declaration') {
      const className = child.childForFieldName('name')?.text || 'Class';
      pieces.push({
        symbol_name: className,
        kind: 'CLASS',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });

      const body = child.childForFieldName('body');
      if (body) {
        for (let j = 0; j < body.namedChildCount; j++) {
          const method = body.namedChild(j);
          if (method && method.type === 'method_declaration') {
            const mName = method.childForFieldName('name')?.text || 'method';
            pieces.push({
              symbol_name: `${className}.${mName}`,
              kind: 'METHOD',
              start_line: method.startPosition.row + 1,
              end_line: method.endPosition.row + 1,
              content: method.text,
            });
          }
        }
      }
    }
  }
  return pieces;
}

// 4. Rust Parser
function chunkRust(tree: Parser.Tree): CodeChunkPiece[] {
  const pieces: CodeChunkPiece[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;

    if (child.type === 'function_item') {
      const name = child.childForFieldName('name')?.text || 'func';
      pieces.push({
        symbol_name: name,
        kind: 'FUNCTION',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'struct_item') {
      const name = child.childForFieldName('name')?.text || 'Struct';
      pieces.push({
        symbol_name: name,
        kind: 'CLASS',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'impl_item') {
      const typeName = child.childForFieldName('type')?.text || 'Impl';
      const body = child.childForFieldName('body');
      if (body) {
        for (let j = 0; j < body.namedChildCount; j++) {
          const item = body.namedChild(j);
          if (item && item.type === 'function_item') {
            const mName = item.childForFieldName('name')?.text || 'method';
            pieces.push({
              symbol_name: `${typeName}.${mName}`,
              kind: 'METHOD',
              start_line: item.startPosition.row + 1,
              end_line: item.endPosition.row + 1,
              content: item.text,
            });
          }
        }
      }
    }
  }
  return pieces;
}

// 5. C & C++ Parser
function chunkCpp(tree: Parser.Tree): CodeChunkPiece[] {
  const pieces: CodeChunkPiece[] = [];
  for (let i = 0; i < tree.rootNode.namedChildCount; i++) {
    const child = tree.rootNode.namedChild(i);
    if (!child) continue;

    if (child.type === 'function_definition') {
      const decl = child.childForFieldName('declarator');
      const name = decl ? decl.text.split('(')[0]?.trim() || 'func' : 'func';
      pieces.push({
        symbol_name: name,
        kind: 'FUNCTION',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    } else if (child.type === 'class_specifier') {
      const name = child.childForFieldName('name')?.text || 'Class';
      pieces.push({
        symbol_name: name,
        kind: 'CLASS',
        start_line: child.startPosition.row + 1,
        end_line: child.endPosition.row + 1,
        content: child.text,
      });
    }
  }
  return pieces;
}

// 6. TypeScript & JavaScript Parser (Compiler API)
function chunkTsJs(source: string, fileName: string): CodeChunkPiece[] {
  const isTsx = fileName.endsWith('.tsx') || fileName.endsWith('.jsx');
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const pieces: CodeChunkPiece[] = [];

  function getNodeLineRange(node: ts.Node): { startLine: number; endLine: number } {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return { startLine: start.line + 1, endLine: end.line + 1 };
  }

  function addPiece(name: string | null, kind: 'FUNCTION' | 'METHOD' | 'CLASS', node: ts.Node): void {
    const range = getNodeLineRange(node);
    pieces.push({
      symbol_name: name,
      kind: kind,
      start_line: range.startLine,
      end_line: range.endLine,
      content: node.getText(sourceFile),
    });
  }

  function visitNode(node: ts.Node): void {
    if (ts.isFunctionDeclaration(node)) {
      addPiece(node.name ? node.name.text : 'anonymous_function', 'FUNCTION', node);
      return;
    }

    if (ts.isClassDeclaration(node)) {
      const className = node.name ? node.name.text : 'AnonymousClass';
      addPiece(className, 'CLASS', node);
      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        if (member && ts.isMethodDeclaration(member)) {
          addPiece(`${className}.${member.name.getText(sourceFile)}`, 'METHOD', member);
        }
      }
      return;
    }

    if (ts.isVariableStatement(node)) {
      const decls = node.declarationList.declarations;
      for (let i = 0; i < decls.length; i++) {
        const d = decls[i];
        if (d && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          addPiece(d.name.getText(sourceFile), 'FUNCTION', node);
        }
      }
      return;
    }

    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
      const binary = node.expression;
      if (binary.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(binary.left)) {
        const target = binary.left.expression.getText(sourceFile);
        if (target === 'exports' || target === 'module.exports') {
          if (ts.isArrowFunction(binary.right) || ts.isFunctionExpression(binary.right)) {
            addPiece(binary.left.name.text, 'FUNCTION', node);
            return;
          }
        }
      }
    }

    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      if (ts.isPropertyAccessExpression(call.expression)) {
        const caller = call.expression.expression.getText(sourceFile);
        const method = call.expression.name.text;
        const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'use'];
        if ((caller === 'router' || caller === 'app') && httpMethods.includes(method.toLowerCase())) {
          const firstArg = call.arguments[0];
          const routePath = firstArg && ts.isStringLiteral(firstArg) ? firstArg.text : '';
          addPiece(`${caller}.${method}(${routePath})`, 'FUNCTION', node);
          return;
        }
      }
    }

    ts.forEachChild(node, visitNode);
  }

  visitNode(sourceFile);
  return pieces;
}

/**
 * Universal Polyglot Code Chunker:
 * Routes code files to the appropriate parser based on file extension.
 * Supports: TypeScript, JavaScript, Python, Go, Java, Rust, C, C++.
 */
export async function chunkSourceFile(source: string, fileName = 'file.ts'): Promise<CodeChunkPiece[]> {
  if (!source || source.trim() === '') {
    return [];
  }

  const ext = path.extname(fileName).toLowerCase();
  let pieces: CodeChunkPiece[] = [];

  if (ext === '.py') {
    const lang = await getLanguage('python');
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    if (tree) pieces = chunkPython(tree);
  } else if (ext === '.go') {
    const lang = await getLanguage('go');
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    if (tree) pieces = chunkGo(tree);
  } else if (ext === '.java') {
    const lang = await getLanguage('java');
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    if (tree) pieces = chunkJava(tree);
  } else if (ext === '.rs') {
    const lang = await getLanguage('rust');
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    if (tree) pieces = chunkRust(tree);
  } else if (['.cpp', '.cc', '.cxx', '.c', '.hpp', '.h'].includes(ext)) {
    const lang = await getLanguage('cpp');
    const parser = new Parser();
    parser.setLanguage(lang);
    const tree = parser.parse(source);
    if (tree) pieces = chunkCpp(tree);
  } else {
    // Default to TypeScript/JavaScript Compiler AST
    pieces = chunkTsJs(source, fileName);
  }

  if (pieces.length === 0) {
    const lineCount = source.split('\n').length;
    return [
      {
        symbol_name: null,
        kind: 'MODULE',
        start_line: 1,
        end_line: lineCount,
        content: source,
      },
    ];
  }

  return pieces;
}