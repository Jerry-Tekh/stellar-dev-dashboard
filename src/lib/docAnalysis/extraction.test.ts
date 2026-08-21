import { describe, expect, it } from 'vitest';
import {
  buildCorpusStatistics,
  detectLanguage,
  extractCodeExamples,
  extractEntities,
  extractRecommendations,
  extractRelations,
  fnv1a,
  htmlToMarkdownish,
  parseHtml,
  parseMarkdown,
  processDocument,
  redactSecrets,
  sanitizeContent,
  slugify,
  splitSentences,
  summarizeSections,
  tokenize,
} from './extraction';

const ACCOUNT_ID = 'GA6SXIZIKMPEYE2CHTDDDG4OG5S4PNKMWOYB2YBNQAGAEAH6ZDBNTZEX';
const CONTRACT_ID = 'CA7QYNF7SOWQ3GLR2BGMZEH3AVAFKBU MNR5ISSP6DF4TBZ3WYFVBWCDR'.replace(/\s/g, '');
const SECRET = 'SBVKZLHNVTHV7SK2NTF4MMWHUBVDYPNSEJLRJVEG5NCFQXTYKGHGJZID';

describe('redactSecrets', () => {
  it('redacts Stellar secret keys before any processing', () => {
    const output = redactSecrets(`Use ${SECRET} carefully.`);
    expect(output).not.toContain(SECRET);
    expect(output).toContain('[REDACTED SECRET]');
  });

  it('leaves public keys and normal text untouched', () => {
    const text = `Account ${ACCOUNT_ID} holds XLM.`;
    expect(redactSecrets(text)).toBe(text);
  });
});

describe('sanitizeContent', () => {
  it('strips control characters and caps length', () => {
    const dirty = 'ok\u0000\u0007text';
    expect(sanitizeContent(dirty)).toBe('oktext');
    expect(sanitizeContent('x'.repeat(300_000)).length).toBeLessThanOrEqual(200_000);
  });
});

describe('detectLanguage', () => {
  it('detects English by stopword frequency', () => {
    expect(detectLanguage('The account can hold a balance and the ledger will record it.')).toBe('en');
  });
  it('detects Spanish text', () => {
    expect(
      detectLanguage('La cuenta puede tener un saldo y el libro mayor lo registra con la transacción.')
    ).toBe('es');
  });
  it('detects Japanese by script', () => {
    expect(detectLanguage('ステラのアカウントは残高を記録します。支払い操作を使います。')).toBe('ja');
  });
  it('returns unknown for tiny ambiguous input', () => {
    expect(detectLanguage('xyz 123')).toBe('unknown');
  });
});

describe('splitSentences', () => {
  it('does not split on abbreviations or decimals', () => {
    const sentences = splitSentences(
      'See SEP-10 e.g. for auth. The fee is 3.5 lumens. It works!'
    );
    expect(sentences).toHaveLength(3);
    expect(sentences[0]).toContain('e.g.');
    expect(sentences[1]).toContain('3.5');
  });
});

describe('parseMarkdown', () => {
  it('builds sections from headings and extracts fenced code', () => {
    const parsed = parseMarkdown(
      `# Guide\nIntro text here.\n## Payments\nPayment moves value.\n\`\`\`js\nconst x = 1;\n\`\`\`\nMore text.`
    );
    expect(parsed.sections.map((section) => section.heading)).toEqual(['Guide', 'Payments']);
    expect(parsed.codeBlocks).toHaveLength(1);
    expect(parsed.codeBlocks[0].language).toBe('js');
    expect(parsed.sections.every((section) => !section.text.includes('CODE_BLOCK'))).toBe(true);
  });
});

describe('htmlToMarkdownish / parseHtml', () => {
  it('strips scripts, styles, and tags while keeping headings', () => {
    const markdown = htmlToMarkdownish(
      '<style>.x{}</style><script>alert(1)</script><h2>Horizon</h2><p>API server &amp; more</p>'
    );
    expect(markdown).toContain('## Horizon');
    expect(markdown).toContain('API server & more');
    expect(markdown).not.toContain('alert');
    expect(markdown).not.toContain('.x{}');
  });
  it('parses html documents into sections', () => {
    const parsed = parseHtml('<h1>Doc</h1><p>First paragraph with content.</p>');
    expect(parsed.sections[0].heading).toBe('Doc');
  });
});

describe('extractEntities', () => {
  const sections = [
    {
      id: 's0',
      heading: 'Overview',
      level: 1,
      text: `Stellar uses the Stellar Consensus Protocol. Account ${ACCOUNT_ID} sent a payment. A trustline is required for assets.`,
    },
  ];
  it('finds regex-based addresses with high confidence', () => {
    const entities = extractEntities(sections);
    const account = entities.find((entity) => entity.text === ACCOUNT_ID);
    expect(account?.type).toBe('account');
    expect(account?.confidence).toBeGreaterThan(0.9);
  });
  it('matches longest lexicon phrases as a single entity', () => {
    const entities = extractEntities(sections);
    const scp = entities.find((entity) => entity.text === 'Stellar Consensus Protocol');
    expect(scp).toBeDefined();
    expect(entities.some((entity) => entity.text === 'Consensus')).toBe(false);
  });
  it('counts repeated mentions', () => {
    const repeated = [
      { id: 's0', heading: 'h', level: 1, text: 'A trustline is required. The trustline must be valid.' },
    ];
    const trustline = extractEntities(repeated).find((entity) => entity.text === 'trustline');
    expect(trustline?.mentions).toBe(2);
  });
});

describe('extractRelations', () => {
  it('extracts typed edges from dependency sentences', () => {
    const sections = [
      {
        id: 's0',
        heading: 'Contracts',
        level: 1,
        text: 'Soroban requires a Footprint for every invocation. Horizon uses Stellar Core for consensus.',
      },
    ];
    const relations = extractRelations(sections);
    const depends = relations.find((relation) => relation.type === 'depends-on');
    expect(depends?.fromLabel).toBe('Soroban');
    expect(depends?.toLabel).toBe('Footprint');
    const relates = relations.find((relation) => relation.type === 'relates-to');
    expect(relates?.fromLabel).toBe('Horizon');
    expect(relates?.toLabel).toBe('Stellar Core');
  });
  it('ignores sentences without resolvable entities', () => {
    const relations = extractRelations([
      { id: 's0', heading: 'h', level: 1, text: 'Randomness requires weather patterns.' },
    ]);
    expect(relations).toHaveLength(0);
  });
});

describe('extractCodeExamples', () => {
  it('normalizes language and links related concepts', () => {
    const examples = extractCodeExamples(
      [{ id: 's0', heading: 'Paying', level: 2, text: 'Use the JS SDK for a payment operation.' }],
      [{ language: '', code: 'const tx = buildPayment(tx);' }]
    );
    expect(examples[0].language).toBe('javascript');
    expect(examples[0].relatedConcepts.length).toBeGreaterThan(0);
  });
  it('links fenced blocks to their host section during document processing', () => {
    const doc = processDocument({
      title: 'Hosted Example',
      format: 'markdown',
      source: 'docs',
      content: '# Intro\nSome context.\n## Paying\n\n```js\nconst tx = buildPayment(tx);\n```\n',
    });
    expect(doc.codeExamples[0].sectionId).toBe('s1');
    expect(doc.codeExamples[0].title).toBe('Paying');
  });
});

describe('extractRecommendations', () => {
  it('separates security notes from best practices', () => {
    const recommendations = extractRecommendations([
      {
        id: 's0',
        heading: 'Safety',
        level: 1,
        text: 'Never share your secret seed with anyone. Always validate input from users. The ledger stores balances.',
      },
    ]);
    expect(recommendations.some((item) => item.category === 'security')).toBe(true);
    expect(recommendations.some((item) => item.category === 'best-practice')).toBe(true);
  });
});

describe('summarizeSections', () => {
  it('prefers informative sentences and keeps original order', () => {
    const summary = summarizeSections(
      [
        {
          id: 's0',
          heading: 'Payments',
          level: 1,
          text: 'The payment operation moves native or issued assets between accounts on the Stellar network. Hmm. Yes.',
        },
      ],
      null,
      'en',
      2
    );
    expect(summary.length).toBeGreaterThan(0);
    expect(summary.length).toBeLessThanOrEqual(2);
  });
});

describe('processDocument', () => {
  const markdown = `# Payment Guide\n\nA payment operation transfers value between accounts.\nEvery payment requires a trustline for issued assets.\n\n## Example\n\n\`\`\`js\nconst transaction = new StellarSdk.TransactionBuilder(account);\n\`\`\`\n\nNever commit a secret seed to version control.`;

  it('produces a deterministic processed document', () => {
    const first = processDocument({
      title: 'Payment Guide',
      format: 'markdown',
      source: 'docs',
      content: markdown,
    });
    const second = processDocument({
      title: 'Payment Guide',
      format: 'markdown',
      source: 'docs',
      content: markdown,
    });
    expect(first.id).toBe(second.id);
    expect(first.checksum).toBe(second.checksum);
    expect(first.language).toBe('en');
    expect(first.concepts).toContain('payment operation');
    expect(first.summary.length).toBeGreaterThan(0);
    expect(first.recommendations.some((item) => item.category === 'security')).toBe(true);
    expect(first.codeExamples).toHaveLength(1);
  });

  it('respects explicit ids and published dates', () => {
    const doc = processDocument({
      id: 'custom-id',
      title: 'Guide',
      format: 'markdown',
      source: 'forum',
      author: 'alice',
      publishedAt: '2026-01-15T00:00:00.000Z',
      content: '# T\nContent body for the guide.',
    });
    expect(doc.id).toBe('custom-id');
    expect(doc.author).toBe('alice');
    expect(doc.publishedAt).toBe('2026-01-15T00:00:00.000Z');
  });

  it('rejects empty titles and content', () => {
    expect(() =>
      processDocument({ title: '', format: 'text', source: 'docs', content: 'hello' })
    ).toThrow();
    expect(() =>
      processDocument({ title: 't', format: 'text', source: 'docs', content: '   ' })
    ).toThrow();
  });
});

describe('utilities', () => {
  it('fnv1a is stable and slugify is url-safe', () => {
    expect(fnv1a('abc')).toBe(fnv1a('abc'));
    expect(fnv1a('abc')).not.toBe(fnv1a('abd'));
    expect(slugify('Stellar Docs: Payments & Trustlines!')).toMatch(/^[\w-]+$/);
  });
  it('tokenize removes stopwords', () => {
    const tokens = tokenize('The payment requires a trustline on the ledger');
    expect(tokens).not.toContain('the');
    expect(tokens).toContain('payment');
  });
  it('buildCorpusStatistics counts document frequency', () => {
    const docs = [
      { sections: [{ id: 's0', heading: 'a', level: 1, text: 'ledger data' }] },
      { sections: [{ id: 's0', heading: 'b', level: 1, text: 'ledger info' }] },
    ].map((partial, index) =>
      processDocument({
        title: `doc${index}`,
        format: 'text',
        source: 'docs',
        content: partial.sections[0].text,
      })
    );
    const stats = buildCorpusStatistics(docs);
    expect(stats.documentCount).toBe(2);
    expect(stats.documentFrequency.get('ledger')).toBe(2);
  });
});
