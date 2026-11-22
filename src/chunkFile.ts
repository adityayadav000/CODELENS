import ts from 'typescript';

export type CodeChunkPiece = {
  symbol_name: string | null;
  kind: 'FUNCTION' | 'METHOD' | 'CLASS' | 'MODULE';
  start_line: number;
  end_line: number;
  content: string;
};

/**
 * Parses TypeScript/JavaScript/JSX code using the official TypeScript Compiler AST.
 * Walks the syntax tree to extract functions, classes, methods, CommonJS exports,
 * and Express route registrations with exact line boundaries.
 */
export function chunkSourceFile(source: string, fileName = 'file.ts'): CodeChunkPiece[] {
  if (!source || source.trim() === '') {
    return [];
  }

  // Detect whether this is TSX/JSX so the compiler parses JSX tags instead of < comparison operators
  const isTsx = fileName.endsWith('.tsx') || fileName.endsWith('.jsx');

  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true, // setParentNodes: allows navigating the syntax tree
    isTsx ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );

  const pieces: CodeChunkPiece[] = [];

  // Helper function to extract 1-based start and end line numbers
  function getNodeLineRange(node: ts.Node): { startLine: number; endLine: number } {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
    return {
      startLine: start.line + 1,
      endLine: end.line + 1,
    };
  }

  // Helper function to record a chunk piece
  function addPiece(
    name: string | null,
    kind: 'FUNCTION' | 'METHOD' | 'CLASS',
    node: ts.Node
  ): void {
    const range = getNodeLineRange(node);
    pieces.push({
      symbol_name: name,
      kind: kind,
      start_line: range.startLine,
      end_line: range.endLine,
      content: node.getText(sourceFile),
    });
  }

  // Recursive AST Visitor function
  function visitNode(node: ts.Node): void {
    // 1. Standard Function Declarations (e.g., function add() {})
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name ? node.name.text : 'anonymous_function';
      addPiece(name, 'FUNCTION', node);
      return;
    }

    // 2. Class Declarations & Methods (e.g., class AuthService {})
    if (ts.isClassDeclaration(node)) {
      const className = node.name ? node.name.text : 'AnonymousClass';
      addPiece(className, 'CLASS', node);

      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        if (member && ts.isMethodDeclaration(member)) {
          const methodName = member.name.getText(sourceFile);
          addPiece(`${className}.${methodName}`, 'METHOD', member);
        }
      }
      return;
    }

    // 3. Variable Statements (e.g., const loginUser = async function(...) {})
    if (ts.isVariableStatement(node)) {
      const declarations = node.declarationList.declarations;
      for (let i = 0; i < declarations.length; i++) {
        const decl = declarations[i];
        if (
          decl &&
          decl.initializer &&
          (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
        ) {
          const name = decl.name.getText(sourceFile);
          addPiece(name, 'FUNCTION', node);
        }
      }
      return;
    }

    // 4. CommonJS Exports (e.g., exports.loginUser = ... or module.exports.loginUser = ...)
    if (ts.isExpressionStatement(node) && ts.isBinaryExpression(node.expression)) {
      const binary = node.expression;
      if (
        binary.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isPropertyAccessExpression(binary.left)
      ) {
        const propAccess = binary.left;
        const propName = propAccess.name.text;
        const target = propAccess.expression.getText(sourceFile);

        if (target === 'exports' || target === 'module.exports') {
          if (
            ts.isArrowFunction(binary.right) ||
            ts.isFunctionExpression(binary.right)
          ) {
            addPiece(propName, 'FUNCTION', node);
            return;
          }
        }
      }
    }

    // 5. Express Route Registrations (e.g., router.post('/login', ...) or app.get('/users', ...))
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression;
      if (ts.isPropertyAccessExpression(call.expression)) {
        const caller = call.expression.expression.getText(sourceFile);
        const method = call.expression.name.text;
        const httpMethods = ['get', 'post', 'put', 'delete', 'patch', 'use'];

        if ((caller === 'router' || caller === 'app') && httpMethods.includes(method.toLowerCase())) {
          const firstArg = call.arguments[0];
          let routePath = '';
          if (firstArg && ts.isStringLiteral(firstArg)) {
            routePath = firstArg.text;
          }
          addPiece(`${caller}.${method}(${routePath})`, 'FUNCTION', node);
          return;
        }
      }
    }

    ts.forEachChild(node, visitNode);
  }

  visitNode(sourceFile);

  // Fallback: If no functions, classes, or routes were found, return whole file as MODULE
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