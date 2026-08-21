import type {
  CodeExample,
  DocumentFormat,
  DocumentSection,
  EdgeType,
  ExtractedEntity,
  ProcessedDocument,
  RawDocumentInput,
  Recommendation,
  SupportedLanguage,
} from '../../types/documentAnalysis';
import {
  BEST_PRACTICE_CUES,
  ENTITY_PATTERNS,
  RELATION_PATTERNS,
  SCRIPT_RANGES,
  SECRET_PATTERN,
  SECRET_REPLACEMENT,
  SECURITY_CUES,
  STOPWORDS,
  STRONG_SECURITY_CUES,
  lookupLexicon,
} from './ontology';

export const MAX_CONTENT_LENGTH = 200_000;
export const MAX_ENTITIES_PER_DOC = 120;
export const SUMMARY_SENTENCES = 3;

export interface CorpusStatistics {
  documentCount: number;
  documentFrequency: Map<string, number>;
}

export interface RawRelation {
  fromLabel: string;
  toLabel: string;
  type: EdgeType;
}

export function redactSecrets(text: string): string {
  return text.replace(SECRET_PATTERN, SECRET_REPLACEMENT);
}

export function sanitizeContent(content: string): string {
  return redactSecrets(
    content
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
      .slice(0, MAX_CONTENT_LENGTH)
  );
}

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (match) => HTML_ENTITIES[match] ?? match);
}

export function htmlToMarkdownish(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
      .replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, body: string) => `\n\`\`\`\n${body}\n\`\`\`\n`)
      .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, level: string, body: string) => {
        const marks = '#'.repeat(Number(level));
        return `\n${marks} ${body.trim()}\n`;
      })
      .replace(/<li[^>]*>/gi, '\n- ')
      .replace(/<\/(?:p|div|li|tr|section|article|blockquote)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

export function detectLanguage(text: string): SupportedLanguage {
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (!letters) return 'unknown';
  for (const { code, re } of SCRIPT_RANGES) {
    const matches = letters.match(re);
    if (matches && matches.length / letters.length > 0.12) return code;
  }
  const words = text.toLowerCase().match(/[\p{L}']+/gu) ?? [];
  if (words.length < 8) return 'unknown';
  let best: SupportedLanguage = 'unknown';
  let bestScore = 0;
  for (const [code, set] of Object.entries(STOPWORDS) as Array<[SupportedLanguage, Set<string>]>) {
    let hits = 0;
    for (const word of words) if (set.has(word)) hits += 1;
    const score = hits / words.length;
    if (score > bestScore) {
      bestScore = score;
      best = code;
    }
  }
  return bestScore >= 0.14 ? best : 'unknown';
}

const ABBREVIATIONS = ['e.g', 'i.e', 'etc', 'vs', 'sep', 'cap', 'approx', 'no'];

export function splitSentences(text: string): string[] {
  let prepared = text;
  for (const abbr of ABBREVIATIONS) {
    prepared = prepared.replace(new RegExp(`\\b${abbr}\\.`, 'gi'), `${abbr}\u0001`);
  }
  prepared = prepared.replace(/(\d)\.(\d)/g, '$1\u0001$2');
  const sentences = prepared
    .split(/(?<=[.!?])\s+(?=["'“(]?[A-Z0-9])/)
    .map((sentence) => sentence.replace(/\u0001/g, '.').trim())
    .filter((sentence) => sentence.length > 0);
  return sentences;
}

export function tokenize(text: string, language: SupportedLanguage = 'en'): string[] {
  const lower = text.toLowerCase();
  const raw = lower.match(/[\p{L}\p{N}_][\p{L}\p{N}_'-]*/gu) ?? [];
  const stopwords = STOPWORDS[language] ?? STOPWORDS.en;
  return raw.filter((word) => word.length > 1 && !(stopwords?.has(word) ?? false));
}

interface ParsedStructure {
  sections: DocumentSection[];
  codeBlocks: Array<{ language: string; code: string }>;
}

export function parseMarkdown(markdown: string): ParsedStructure {
  const codeBlocks: Array<{ language: string; code: string }> = [];
  let working = markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang: string, code: string) => {
    codeBlocks.push({ language: lang || 'text', code: code.replace(/\n$/, '') });
    return `\n[[CODEBLOCK${codeBlocks.length - 1}]]\n`;
  });
  working = working
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s?/gm, '');
  const sections = buildSectionsFromHeadings(working);
  return { sections, codeBlocks };
}

export function parseHtml(html: string): ParsedStructure {
  return parseMarkdown(htmlToMarkdownish(html));
}

export function parsePlainText(text: string): ParsedStructure {
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const sections =
    blocks.length <= 1
      ? [{ id: '', heading: 'Document', level: 1, text: text.trim() }]
      : buildSectionsFromHeadings(
          blocks.map((block) => {
            const firstLine = block.split('\n')[0]?.trim() ?? '';
            const isHeading =
              firstLine.length > 0 &&
              firstLine.length < 80 &&
              firstLine === firstLine.toUpperCase() &&
              /[\p{L}]/u.test(firstLine);
            return isHeading ? `## ${titleCase(firstLine)}\n${block.split('\n').slice(1).join('\n')}` : block;
          }).join('\n\n')
        );
  return { sections, codeBlocks: [] };
}

function titleCase(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\s(-])(\p{L})/gu, (_m, sep: string, letter: string) => sep + letter.toUpperCase());
}

function buildSectionsFromHeadings(body: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  let current: DocumentSection | null = null;
  let index = 0;
  const flush = () => {
    if (current && current.text.trim()) sections.push(current);
  };
  for (const line of body.split('\n')) {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flush();
      current = {
        id: `s${index}`,
        heading: heading[2].trim(),
        level: heading[1].length,
        text: '',
      };
      index += 1;
    } else if (current) {
      current.text += `${line}\n`;
    } else {
      current = { id: `s${index}`, heading: 'Introduction', level: 1, text: `${line}\n` };
      index += 1;
    }
  }
  flush();
  return sections.map((section) => ({ ...section, text: section.text.trim() }));
}

export function extractEntities(sections: DocumentSection[]): ExtractedEntity[] {
  const counts = new Map<string, ExtractedEntity>();
  const record = (text: string, type: ExtractedEntity['type'], confidence: number) => {
    const key = `${type}:${text.toLowerCase()}`;
    const existing = counts.get(key);
    if (existing) {
      existing.mentions += 1;
      existing.confidence = Math.min(0.98, existing.confidence + 0.01);
    } else {
      counts.set(key, { text, type, mentions: 1, confidence });
    }
  };
  for (const section of sections) {
    for (const { type, pattern, confidence } of ENTITY_PATTERNS) {
      const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
      for (const match of section.text.matchAll(global)) {
        record(match[0], type, confidence);
      }
    }
    const sentences = splitSentences(section.text);
    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const spans: Array<{ start: number; end: number }> = [];
      const candidates = collectLexiconCandidates(lower);
      for (const candidate of candidates) {
        if (spans.some((span) => candidate.start < span.end && candidate.end > span.start)) continue;
        const original = sentence.slice(candidate.start, candidate.end);
        record(original, candidate.type, 0.78);
        spans.push({ start: candidate.start, end: candidate.end });
      }
    }
  }
  return [...counts.values()]
    .sort(
      (a, b) =>
        b.mentions - a.mentions ||
        b.confidence - a.confidence ||
        a.text.localeCompare(b.text)
    )
    .slice(0, MAX_ENTITIES_PER_DOC);
}

interface CandidateSpan {
  start: number;
  end: number;
  type: ExtractedEntity['type'];
}

function collectLexiconCandidates(lowerSentence: string): CandidateSpan[] {
  const candidates: CandidateSpan[] = [];
  const wordRe = /[\p{L}][\p{L}\p{N}'-]*/gu;
  const words: Array<{ word: string; start: number; end: number }> = [];
  for (const match of lowerSentence.matchAll(wordRe)) {
    words.push({ word: match[0], start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  for (let i = 0; i < words.length; i += 1) {
    for (let len = Math.min(5, words.length - i); len >= 1; len -= 1) {
      const slice = words.slice(i, i + len);
      const phrase = slice.map((w) => w.word).join(' ');
      const entry = lookupLexicon(phrase);
      if (entry) {
        candidates.push({
          start: slice[0].start,
          end: slice[slice.length - 1].end,
          type: entry.type,
        });
        break;
      }
    }
  }
  return candidates.sort((a, b) => a.start - b.start || b.end - a.end);
}

export function extractRelations(sections: DocumentSection[]): RawRelation[] {
  const relations: RawRelation[] = [];
  const known = new Set<string>();
  for (const section of sections) {
    for (const entity of extractEntities([section])) known.add(entity.text.toLowerCase());
  }
  const resolveTerm = (term: string | undefined): string => {
    const cleaned = cleanRelationTerm(term);
    if (!cleaned) return '';
    const words = cleaned.split(/\s+/);
    for (let len = words.length; len >= 1; len -= 1) {
      const phrase = words.slice(0, len).join(' ');
      if (known.has(phrase.toLowerCase()) || lookupLexicon(phrase)) return phrase;
    }
    return '';
  };
  for (const section of sections) {
    for (const sentence of splitSentences(section.text)) {
      for (const { pattern, edgeType } of RELATION_PATTERNS) {
        const match = sentence.match(pattern);
        if (!match) continue;
        const from = resolveTerm(match[1]);
        const to = resolveTerm(match[2]);
        if (!from || !to || from.toLowerCase() === to.toLowerCase()) continue;
        relations.push({ fromLabel: from, toLabel: to, type: edgeType });
      }
    }
  }
  return relations;
}

function cleanRelationTerm(term: string | undefined): string {
  if (!term) return '';
  return term
    .replace(/\s+(?:is|are|was|were|the|a|an|of|and|to|for|with)$/i, '')
    .replace(/^(?:the|a|an)\s+/i, '')
    .trim();
}

export function extractCodeExamples(
  sections: DocumentSection[],
  codeBlocks: Array<{ language: string; code: string }>
): CodeExample[] {
  const examples: CodeExample[] = [];
  codeBlocks.forEach((block, index) => {
    const trimmed = block.code.trim();
    if (trimmed.length < 8) return;
    const marker = `[[CODEBLOCK${index}]]`;
    const hostSection =
      sections.find((section) => section.text.includes(marker)) ??
      sections.find((section) => section.text.includes(trimmed.slice(0, 40)));
    const contextText = hostSection ? `${hostSection.heading} ${hostSection.text}` : '';
    const related = extractEntities(hostSection ? [hostSection] : [])
      .filter((entity) =>
        ['concept', 'component', 'operation', 'endpoint', 'asset', 'code-artifact'].includes(entity.type)
      )
      .slice(0, 5)
      .map((entity) => entity.text);
    examples.push({
      id: `code-${index}`,
      language: normalizeCodeLanguage(block.language, trimmed),
      code: trimmed,
      title: hostSection?.heading,
      sectionId: hostSection?.id,
      relatedConcepts: related.length
        ? related
        : inferConceptsFromText(contextText || trimmed),
    });
  });
  return examples;
}

function normalizeCodeLanguage(tag: string, code: string): string {
  if (tag && tag !== 'text') return tag;
  if (/\b(?:const|let|function|import|=>)\b/.test(code)) return 'javascript';
  if (/\b(?:def|import)\b/.test(code) && /:\s*$/m.test(code)) return 'python';
  if (/\bfunc\b|\bpackage main\b/.test(code)) return 'go';
  if (/\bpublic\s+class\b/.test(code)) return 'java';
  if (/^\s*[#;]/.test(code) && /\b(?:curl|http)/i.test(code)) return 'bash';
  return 'text';
}

function inferConceptsFromText(text: string): string[] {
  const found: string[] = [];
  const lower = text.toLowerCase();
  for (const term of [
    'stellar',
    'soroban',
    'horizon',
    'payment',
    'trustline',
    'claimable balance',
    'contract',
    'transaction',
    'ledger',
    'asset',
  ]) {
    if (lower.includes(term)) found.push(term);
  }
  return found.slice(0, 5);
}

export function extractRecommendations(sections: DocumentSection[]): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const seen = new Set<string>();
  for (const section of sections) {
    for (const sentence of splitSentences(section.text)) {
      const isSecurity = SECURITY_CUES.test(sentence);
      const isPractice = BEST_PRACTICE_CUES.test(sentence);
      const isStrongSecurity = STRONG_SECURITY_CUES.test(sentence);
      if (!isSecurity && !isPractice) continue;
      if (sentence.length < 24 || sentence.length > 400) continue;
      const key = sentence.toLowerCase().slice(0, 120);
      if (seen.has(key)) continue;
      seen.add(key);
      recommendations.push({
        text: sentence,
        category:
          isStrongSecurity || (isSecurity && !isPractice) ? 'security' : 'best-practice',
        sectionId: section.id,
      });
    }
  }
  return recommendations.slice(0, 40);
}

export function buildCorpusStatistics(documents: ProcessedDocument[]): CorpusStatistics {
  const documentFrequency = new Map<string, number>();
  for (const document of documents) {
    const seen = new Set<string>();
    for (const section of document.sections) {
      for (const token of tokenize(section.text, document.language)) {
        seen.add(token);
      }
    }
    for (const token of seen) {
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }
  return { documentCount: documents.length, documentFrequency };
}

export function summarizeSections(
  sections: DocumentSection[],
  corpus: CorpusStatistics | null,
  language: SupportedLanguage,
  maxSentences = SUMMARY_SENTENCES
): string[] {
  const scored: Array<{ sentence: string; score: number; order: number }> = [];
  let order = 0;
  for (const section of sections) {
    const sentences = splitSentences(section.text);
    sentences.forEach((sentence, position) => {
      if (sentence.length < 40 || sentence.length > 320) return;
      const tokens = tokenize(sentence, language);
      if (tokens.length < 4) return;
      let score = 0;
      for (const token of tokens) {
        const df = corpus?.documentFrequency.get(token) ?? 1;
        const idf = corpus && corpus.documentCount > 0 ? Math.log(corpus.documentCount / df) : 1;
        score += 1 + idf;
      }
      score /= Math.sqrt(tokens.length);
      score *= 1 + (position === 0 ? 0.25 : 0) + (section.level <= 2 ? 0.15 : 0);
      scored.push({ sentence, score, order: order + position });
    });
    order += sentences.length;
  }
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, maxSentences)
    .sort((a, b) => a.order - b.order)
    .map((item) => item.sentence);
}

export function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'doc'
  );
}

export function processDocument(
  input: RawDocumentInput,
  corpus: CorpusStatistics | null = null,
  ingestedAt: string = new Date().toISOString()
): ProcessedDocument {
  if (!input.title?.trim()) {
    throw new Error('Document title is required');
  }
  if (!input.content?.trim()) {
    throw new Error('Document content is empty');
  }
  const content = sanitizeContent(input.content);
  const parsed =
    input.format === 'html'
      ? parseHtml(content)
      : input.format === 'markdown'
        ? parseMarkdown(content)
        : parsePlainText(content);
  const fullText = parsed.sections.map((section) => section.text).join('\n');
  const language = detectLanguage(`${input.title}\n${fullText}`);
  const entities = extractEntities(parsed.sections);
  const concepts = dedupe(
    entities
      .filter((entity) => entity.type !== 'account' && entity.type !== 'transaction')
      .map((entity) => entity.text)
  ).slice(0, 40);
  const checksum = fnv1a(`${input.title}|${content}`);
  return {
    id: input.id?.trim() || `${slugify(input.title)}-${checksum}`,
    title: input.title.trim(),
    format: input.format,
    source: input.source,
    language,
    wordCount: (fullText.match(/\S+/g) ?? []).length,
    url: input.url,
    author: input.author,
    publishedAt: input.publishedAt,
    ingestedAt,
    checksum,
    summary: summarizeSections(parsed.sections, corpus, language),
    sections: parsed.sections,
    entities,
    concepts,
    codeExamples: extractCodeExamples(parsed.sections, parsed.codeBlocks),
    recommendations: extractRecommendations(parsed.sections),
  };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}
