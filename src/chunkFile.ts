import ts from 'typescript';

export type CodeChunkPiece = {
  symbol_name: string | null;
  kind: 'FUNCTION' | 'METHOD' | 'CLASS' | 'MODULE';
  start_line: number;
  end_line: number;
  content: string;
};

/**
 * Parses TypeScript/JavaScript code using the official TypeScript Compiler AST.
 * Walks the syntax tree to extract top-level and exported functions, classes,
 * methods, and arrow functions with exact token spans and line boundaries.
 */
export function chunkSourceFile(source: string, fileName = 'file.ts'): CodeChunkPiece[] {
  if (!source || source.trim() === '') {
    return [];
  }

  // 1. Create the AST SourceFile using the TypeScript compiler
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true // setParentNodes: allows navigating the syntax tree
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

  // 2. Recursive AST Visitor function
  function visitNode(node: ts.Node): void {
    // Case A: Standard Function Declaration (e.g., function calculateTotal() {})
    if (ts.isFunctionDeclaration(node)) {
      const name = node.name ? node.name.text : 'anonymous_function';
      addPiece(name, 'FUNCTION', node);
      return; // Do not traverse inside so the function remains a single chunk
    }

    // Case B: Class Declaration (e.g., class AuthService {})
    if (ts.isClassDeclaration(node)) {
      const className = node.name ? node.name.text : 'AnonymousClass';
      addPiece(className, 'CLASS', node);

      // Extract individual methods inside the class
      for (let i = 0; i < node.members.length; i++) {
        const member = node.members[i];
        if (member && ts.isMethodDeclaration(member)) {
          const methodName = member.name.getText(sourceFile);
          addPiece(`${className}.${methodName}`, 'METHOD', member);
        }
      }
      return;
    }

    // Case C: Variable Statement holding a function (e.g., const loginUser = async function(...) {})
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

    // Walk child nodes recursively
    ts.forEachChild(node, visitNode);
  }

  // Walk the AST tree starting from the root
  visitNode(sourceFile);

  // Fallback: If no functions or classes were found, return the whole file as a MODULE chunk
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