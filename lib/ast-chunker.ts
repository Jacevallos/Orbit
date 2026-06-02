// AST-level code chunker: extracts individual functions, methods, and classes
// from source files. Uses brace-counting (C#/Java/TS/JS) and indentation (Python)
// rather than a full AST parser — handles real-world code reliably without
// native binary dependencies.

export interface CodeChunk {
  name: string;
  type: "class" | "method" | "function";
  content: string;
  startLine: number; // 1-indexed
  endLine: number;
}

const MAX_CHUNK_LINES = 150;

// Entry point: dispatch to the right extractor based on file extension.
// Returns empty array for unknown/binary files (caller falls back to whole-file).
export function extractChunks(content: string, filePath: string): CodeChunk[] {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const lines = content.split("\n");
  if (lines.length < 4) return [];

  if (["cs", "java", "cpp", "c", "h", "go", "swift", "rs", "kt"].includes(ext))
    return extractBraceChunks(lines);
  if (["ts", "tsx", "js", "jsx"].includes(ext))
    return extractJsChunks(lines);
  if (ext === "py")
    return extractPyChunks(lines);

  return [];
}

// ─── Brace-language extractor (C#, Java, Go, Rust, etc.) ─────────────────────

const BRACE_CLASS_RE =
  /^\s*(?:(?:public|private|protected|internal|static|abstract|sealed|partial|final)\s+)*(?:class|interface|enum|struct|record)\s+([\w<>]+)/;

// Matches lines that start a method/function body. Requires:
//   1. One or more access/modifier keywords at the start
//   2. A word that looks like a return type
//   3. A word that looks like a method name
//   4. Followed by ( or <
// This rejects field declarations (no parens) and abstract signatures (no body).
const BRACE_METHOD_RE =
  /^\s*(public|private|protected|internal|static|override|virtual|async|abstract|new|unsafe|extern|partial)\b[\s\w<>\[\]?,.*]*\b([\w]+)\s*[(<]/;

function extractBraceChunks(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const classMatch = BRACE_CLASS_RE.exec(line);
    const methodMatch = !classMatch ? BRACE_METHOD_RE.exec(line) : null;
    if (!classMatch && !methodMatch) { i++; continue; }

    const name = classMatch ? classMatch[1] : methodMatch![2];
    const type: CodeChunk["type"] = classMatch ? "class" : "method";

    // Find the opening { within the next 8 lines
    let braceStart = -1;
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      if (lines[j].includes("{")) { braceStart = j; break; }
    }
    if (braceStart < 0) { i++; continue; }

    // Count braces to find the closing }
    let depth = 0;
    let end = braceStart;
    for (let j = braceStart; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth === 0) { end = j; break; }
    }
    if (depth !== 0) { i++; continue; } // unbalanced — skip

    // Walk backward to include doc comments and attributes (/// [Attr])
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1].trim();
      if (
        prev.startsWith("///") || prev.startsWith("//") ||
        prev.startsWith("*") || prev.startsWith("/*") || prev.startsWith("*/") ||
        (prev.startsWith("[") && prev.endsWith("]")) || prev === ""
      ) start--;
      else break;
    }

    const sliceEnd = Math.min(end + 1, start + MAX_CHUNK_LINES);
    const chunkLines = lines.slice(start, sliceEnd);
    if (chunkLines.length < 2) { i = end + 1; continue; }

    chunks.push({
      name,
      type,
      content: chunkLines.join("\n") + (end + 1 > sliceEnd ? "\n// [truncated]" : ""),
      startLine: start + 1,
      endLine: sliceEnd,
    });

    i = end + 1;
  }

  return chunks;
}

// ─── JS/TS extractor ──────────────────────────────────────────────────────────

// Matches: function foo(, const foo = (, export default function(, async function foo(
const JS_FUNC_RE =
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([\w]*)\s*[\(<]/;
// Matches: const/let foo = (...) => or const/let foo = async (...) =>
const JS_ARROW_RE =
  /^\s*(?:export\s+)?(?:const|let|var)\s+([\w]+)\s*=\s*(?:async\s*)?\(/;
// Matches: class methods (indented, optional modifiers)
const JS_METHOD_RE =
  /^\s+(?:async\s+|static\s+|private\s+|public\s+|protected\s+|override\s+|get\s+|set\s+)*([\w]+)\s*[(<]/;
const JS_CLASS_RE =
  /^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([\w]+)/;

function extractJsChunks(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const classMatch = JS_CLASS_RE.exec(line);
    const funcMatch = !classMatch ? JS_FUNC_RE.exec(line) : null;
    const arrowMatch = !classMatch && !funcMatch ? JS_ARROW_RE.exec(line) : null;
    const methodMatch = !classMatch && !funcMatch && !arrowMatch ? JS_METHOD_RE.exec(line) : null;

    const anyMatch = classMatch || funcMatch || arrowMatch || methodMatch;
    if (!anyMatch) { i++; continue; }

    let name = "anonymous";
    let type: CodeChunk["type"] = "function";
    if (classMatch) { name = classMatch[1]; type = "class"; }
    else if (funcMatch) { name = funcMatch[1] || "anonymous"; }
    else if (arrowMatch) { name = arrowMatch[1]; }
    else if (methodMatch) { name = methodMatch[1]; type = "method"; }

    // Find {
    let braceStart = -1;
    for (let j = i; j < Math.min(i + 8, lines.length); j++) {
      if (lines[j].includes("{")) { braceStart = j; break; }
    }
    if (braceStart < 0) { i++; continue; }

    // Count braces
    let depth = 0;
    let end = braceStart;
    for (let j = braceStart; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === "{") depth++;
        else if (ch === "}") depth--;
      }
      if (depth === 0) { end = j; break; }
    }
    if (depth !== 0) { i++; continue; }

    // Include JSDoc above
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1].trim();
      if (prev.startsWith("*") || prev.startsWith("/*") || prev.startsWith("//") || prev === "")
        start--;
      else break;
    }

    const sliceEnd = Math.min(end + 1, start + MAX_CHUNK_LINES);
    chunks.push({
      name,
      type,
      content: lines.slice(start, sliceEnd).join("\n") + (end + 1 > sliceEnd ? "\n// [truncated]" : ""),
      startLine: start + 1,
      endLine: sliceEnd,
    });

    i = end + 1;
  }

  return chunks;
}

// ─── Python extractor ─────────────────────────────────────────────────────────

const PY_DEF_RE = /^(\s*)(def|class)\s+([\w]+)/;

function extractPyChunks(lines: string[]): CodeChunk[] {
  const chunks: CodeChunk[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = PY_DEF_RE.exec(lines[i]);
    if (!match) continue;

    const baseIndent = match[1].length;
    const name = match[3];
    const type: CodeChunk["type"] = match[2] === "class" ? "class" : "function";

    let end = i + 1;
    while (end < lines.length) {
      const trimmed = lines[end].trim();
      if (trimmed === "") { end++; continue; }
      const indent = (lines[end].match(/^(\s*)/) ?? ["", ""])[1].length;
      if (indent <= baseIndent && trimmed !== "") break;
      end++;
    }

    // Include decorators above
    let start = i;
    while (start > 0) {
      const prev = lines[start - 1].trim();
      if (prev.startsWith("@") || prev.startsWith("#") || prev === "") start--;
      else break;
    }

    const sliceEnd = Math.min(end, start + MAX_CHUNK_LINES);
    chunks.push({
      name,
      type,
      content: lines.slice(start, sliceEnd).join("\n") + (end > sliceEnd ? "\n# [truncated]" : ""),
      startLine: start + 1,
      endLine: sliceEnd,
    });

    i = end - 1;
  }

  return chunks;
}
