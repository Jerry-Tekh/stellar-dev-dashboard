import type {
  AnswerResponse,
  KnowledgeGraphSnapshot,
  ProcessedDocument,
  QuestionType,
} from '../../types/documentAnalysis';
import { splitSentences, tokenize } from './extraction';
import type { SearchIndex } from './searchEngine';
import { search, searchCodeExamples } from './searchEngine';

const TROUBLESHOOTING_TERMS = [
  'error',
  'failed',
  'failing',
  'not working',
  'broken',
  'debug',
  'fix',
  'problem',
  'issue',
  'exception',
  'timeout',
];

export function classifyQuestion(question: string): QuestionType {
  const normalized = question.toLowerCase().trim();
  if (/\b(what|who)\s+(is|are|was|were)\b/.test(normalized) || /^define\b/.test(normalized)) {
    return 'what-is';
  }
  if (/\b(how (do|to|can)|steps to|guide to|walkthrough)\b/.test(normalized)) return 'how-to';
  if (TROUBLESHOOTING_TERMS.some((term) => normalized.includes(term))) return 'troubleshooting';
  if (/\b(example|code|snippet|sample|implement)\b/.test(normalized)) return 'code-example';
  if (/\b(vs\.?|versus|difference between|compare(d)? (to|with))\b/.test(normalized)) {
    return 'comparison';
  }
  return 'general';
}

function rankSentences(
  text: string,
  heading: string,
  queryTokens: string[],
  language: ProcessedDocument['language']
): Array<{ sentence: string; score: number }> {
  const headingTokens = new Set(tokenize(heading, language));
  const sentences = splitSentences(text);
  return sentences
    .map((sentence, position) => {
      const tokens = tokenize(sentence, language);
      if (!tokens.length) return { sentence, score: 0 };
      const tokenSet = new Set(tokens);
      let overlap = 0;
      for (const token of queryTokens) if (tokenSet.has(token)) overlap += 1;
      let score = overlap / Math.sqrt(tokens.length);
      score *= 1 + (position === 0 ? 0.2 : 0);
      for (const token of queryTokens) if (headingTokens.has(token)) score += 0.05;
      return { sentence, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.sentence.localeCompare(b.sentence));
}

export function answerQuestion(
  index: SearchIndex,
  snapshot: KnowledgeGraphSnapshot,
  documents: ProcessedDocument[],
  question: string
): AnswerResponse {
  const trimmed = question.trim();
  const questionType = classifyQuestion(trimmed);
  const queryTokens = tokenize(trimmed);

  if (questionType === 'code-example') {
    const examples = searchCodeExamples(documents, trimmed, 3);
    if (examples.length) {
      const best = examples[0];
      const document = documents.find((item) => item.id === best.documentId);
      return {
        question: trimmed,
        questionType,
        answer: `Found ${examples.length} code example${examples.length > 1 ? 's' : ''}. The closest match is a ${best.language} snippet${best.title ? ` from "${best.title}"` : ''} in "${best.documentTitle}".`,
        confidence: Math.min(0.9, 0.45 + examples.length * 0.12),
        citations: [
          {
            documentId: best.documentId,
            documentTitle: best.documentTitle,
            sectionId: best.sectionId,
            heading: best.title,
            url: document?.url,
          },
        ],
        relatedConcepts: [...new Set(examples.flatMap((example) => example.relatedConcepts))].slice(0, 6),
        codeExamples: examples,
      };
    }
  }

  const boostTerms =
    questionType === 'troubleshooting' ? TROUBLESHOOTING_TERMS.slice(0, 6) : undefined;
  const searchResponse = search(index, snapshot, trimmed, { limit: 5, boostTerms });
  const topPassages = searchResponse.results.slice(0, 3);

  if (!topPassages.length) {
    return {
      question: trimmed,
      questionType,
      answer:
        'No relevant documentation was found for this question. Try rephrasing with Stellar terminology, or ingest additional documents.',
      confidence: 0.05,
      citations: [],
      relatedConcepts: [],
    };
  }

  const queryTokenSet = new Set(queryTokens);
  const candidates: Array<{ sentence: string; score: number; resultIndex: number }> = [];
  topPassages.forEach((result, resultIndex) => {
    const document = documents.find((item) => item.id === result.documentId);
    const section = document?.sections.find((item) => item.id === result.sectionId);
    if (!document || !section) return;
    for (const ranked of rankSentences(section.text, section.heading, queryTokens, document.language)) {
      candidates.push({ ...ranked, resultIndex });
    }
  });
  candidates.sort(
    (a, b) =>
      b.score - a.score ||
      a.resultIndex - b.resultIndex ||
      a.sentence.localeCompare(b.sentence)
  );

  const chosen: string[] = [];
  let charCount = 0;
  for (const candidate of candidates) {
    if (chosen.length >= 3 || charCount + candidate.sentence.length > 480) break;
    if (chosen.includes(candidate.sentence)) continue;
    chosen.push(candidate.sentence);
    charCount += candidate.sentence.length;
  }

  const usedResults = topPassages.filter(
    (result, resultIndex) => candidates.some((candidate) => candidate.resultIndex === resultIndex) || resultIndex === 0
  );
  const citations = [...new Map(usedResults.map((result) => [`${result.documentId}:${result.sectionId}`, result.citation])).values()];

  const relatedConcepts = [
    ...new Set(topPassages.flatMap((result) => result.matchedConcepts)),
  ].slice(0, 6);

  const baseConfidence = topPassages[0]?.score ?? 0;
  const coverage = queryTokens.length
    ? queryTokens.filter((token) => topPassages[0].snippet.toLowerCase().includes(token)).length /
      queryTokens.length
    : 0;
  const confidence = Math.max(
    0.08,
    Math.min(0.97, baseConfidence * 0.7 + coverage * 0.25 + (chosen.length ? 0.05 : 0))
  );

  return {
    question: trimmed,
    questionType,
    answer: chosen.join(' ') || topPassages[0].snippet,
    confidence: Math.round(confidence * 100) / 100,
    citations,
    relatedConcepts,
  };
}
