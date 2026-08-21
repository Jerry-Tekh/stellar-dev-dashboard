import type {
  ContractFunction,
  ContractParam,
  ContractTypeDef,
  ParamKind,
  ParsedContract,
} from '../../types/contractTesting';

/**
 * Lightweight structural parser for Soroban (Rust) contract source. It does
 * not build a real AST — it locates `#[contractimpl]` blocks and `pub fn`
 * signatures with brace/bracket-aware scanning, which is enough to drive
 * heuristic static analysis and test generation without a Rust toolchain in
 * the browser.
 */

const KNOWN_KINDS: ParamKind[] = [
  'Address',
  'Symbol',
  'String',
  'BytesN',
  'Bytes',
  'Vec',
  'Map',
  'u32',
  'u64',
  'u128',
  'i32',
  'i64',
  'i128',
  'bool',
];

export function classifyType(rawType: string): ParamKind {
  const type = rawType.trim().replace(/^&\s*/, '').replace(/^mut\s+/, '');
  for (const kind of KNOWN_KINDS) {
    if (type === kind || type.startsWith(`${kind}<`) || type.startsWith(`${kind}(`)) {
      return kind;
    }
  }
  return 'unknown';
}

/**
 * Splits a comma-separated list while respecting <>, (), [] nesting, so
 * `Vec<Map<u32, i128>>, Address` splits into two items, not five.
 */
export function splitTopLevel(input: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of input) {
    if (char === '<' || char === '(' || char === '[') depth++;
    else if (char === '>' || char === ')' || char === ']') depth = Math.max(0, depth - 1);
    if (char === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim().length > 0) parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part.length > 0);
}

/**
 * Given the index of an opening `{`, returns the index one past its
 * matching `}` (simple depth counting; adequate for well-formed Rust source
 * and does not attempt to special-case braces inside string/char literals).
 */
function findMatchingBrace(source: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return source.length;
}

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length;
}

function parseParams(paramList: string): ContractParam[] {
  return splitTopLevel(paramList)
    .filter((raw) => raw !== 'self' && raw !== '&self' && raw !== '&mut self')
    .map((raw) => {
      const colonIndex = raw.indexOf(':');
      if (colonIndex === -1) {
        return { name: raw.trim(), type: 'unknown', kind: 'unknown' as ParamKind };
      }
      const name = raw.slice(0, colonIndex).trim();
      const type = raw.slice(colonIndex + 1).trim();
      return { name, type, kind: classifyType(type) };
    })
    // The `Env` handle is a Soroban calling-convention parameter, not
    // contract-domain input worth generating test values for.
    .filter((param) => param.type !== 'Env');
}

function countBranches(body: string): number {
  const ifCount = (body.match(/\bif\s+/g) ?? []).length;
  const matchCount = (body.match(/\bmatch\s+/g) ?? []).length;
  const loopCount = (body.match(/\b(for|while)\s+/g) ?? []).length;
  const tryCount = (body.match(/\?[\s;)]/g) ?? []).length;
  return ifCount + matchCount + loopCount + tryCount;
}

function analyzeFunctionBody(body: string): Pick<
  ContractFunction,
  | 'hasAuthCheck'
  | 'hasUncheckedArithmetic'
  | 'hasPanicRisk'
  | 'hasExternalCall'
  | 'hasStorageWrite'
  | 'branchCount'
> {
  const hasAuthCheck = /\.require_auth(_for_args)?\s*\(/.test(body);
  const hasArithmetic = /[^=!<>]=?\s*[a-zA-Z0-9_)\]]\s*[+\-*]\s*[a-zA-Z0-9_(]/.test(body);
  const hasCheckedArithmetic = /\.checked_(add|sub|mul|div)\s*\(/.test(body);
  const hasStorageWrite = /\.storage\(\)[\s\S]{0,40}\.(set|extend_ttl|bump)\s*\(/.test(body);
  const hasPanicRisk = /\bpanic!\s*\(|\.unwrap\s*\(\)|\.expect\s*\(/.test(body);
  const hasExternalCall = /\.invoke_contract(_check_args)?\s*::?</.test(body) ||
    /env\.invoke_contract/.test(body);
  return {
    hasAuthCheck,
    hasUncheckedArithmetic: hasArithmetic && !hasCheckedArithmetic,
    hasPanicRisk,
    hasExternalCall,
    hasStorageWrite,
    branchCount: countBranches(body),
  };
}

const FN_SIGNATURE_RE = /pub\s+fn\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(->\s*([^\{]+))?\s*\{/g;

function parseFunctionsInBlock(source: string, blockStart: number, blockEnd: number): ContractFunction[] {
  const block = source.slice(blockStart, blockEnd);
  const functions: ContractFunction[] = [];
  FN_SIGNATURE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FN_SIGNATURE_RE.exec(block))) {
    const [, name, paramList, , returnTypeRaw] = match;
    const openBraceIndex = blockStart + match.index + match[0].length - 1;
    const bodyEnd = findMatchingBrace(source, openBraceIndex);
    const body = source.slice(openBraceIndex, bodyEnd);
    const analysis = analyzeFunctionBody(body);
    functions.push({
      name,
      params: parseParams(paramList),
      returnType: returnTypeRaw ? returnTypeRaw.trim() : null,
      line: lineOf(source, blockStart + match.index),
      isPublic: true,
      mutatesState: analysis.hasStorageWrite,
      ...analysis,
    });
  }
  return functions;
}

function parseTypes(source: string): ContractTypeDef[] {
  const types: ContractTypeDef[] = [];
  const re = /#\[contracttype\][\s\S]{0,80}?pub\s+(struct|enum)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    types.push({
      name: match[2],
      kind: match[1] as 'struct' | 'enum',
      line: lineOf(source, match.index),
    });
  }
  return types;
}

function findContractName(source: string): string {
  const match = /#\[contract\][\s\S]{0,80}?pub\s+struct\s+([a-zA-Z_][a-zA-Z0-9_]*)/.exec(source);
  return match ? match[1] : 'Contract';
}

/**
 * Parses Soroban Rust source into a structural model. Every `#[contractimpl]`
 * block in the file is scanned for `pub fn` entry points.
 */
export function parseContract(source: string): ParsedContract {
  const functions: ContractFunction[] = [];
  const implRe = /#\[contractimpl\]/g;
  let match: RegExpExecArray | null;
  while ((match = implRe.exec(source))) {
    const braceIndex = source.indexOf('{', match.index);
    if (braceIndex === -1) continue;
    const blockEnd = findMatchingBrace(source, braceIndex);
    functions.push(...parseFunctionsInBlock(source, braceIndex, blockEnd));
    implRe.lastIndex = blockEnd;
  }
  return {
    contractName: findContractName(source),
    functions,
    types: parseTypes(source),
    lineCount: source.split('\n').length,
    usesStorage: functions.some((fn) => fn.hasStorageWrite) || /\.storage\(\)/.test(source),
    usesCrossContractCalls: functions.some((fn) => fn.hasExternalCall),
  };
}
