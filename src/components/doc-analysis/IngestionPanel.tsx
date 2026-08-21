import React, { useRef, useState } from 'react';
import type { DocumentFormat, DocumentSourceKind, RawDocumentInput } from '../../types/documentAnalysis';

const FORMATS: DocumentFormat[] = ['markdown', 'html', 'text'];
const SOURCES: DocumentSourceKind[] = ['docs', 'whitepaper', 'specification', 'forum', 'community'];

const EXTENSION_FORMAT: Record<string, DocumentFormat> = {
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  txt: 'text',
};

interface IngestionPanelProps {
  processing: boolean;
  onIngest: (_inputs: RawDocumentInput[]) => void;
}

export default function IngestionPanel({ processing, onIngest }: IngestionPanelProps) {
  const [title, setTitle] = useState('');
  const [format, setFormat] = useState<DocumentFormat>('markdown');
  const [source, setSource] = useState<DocumentSourceKind>('docs');
  const [author, setAuthor] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [content, setContent] = useState('');
  const fileRef = useRef<HTMLInputElement | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || processing) return;
    onIngest([
      {
        title: title.trim(),
        format,
        source,
        content,
        author: author.trim() || undefined,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
      },
    ]);
    setTitle('');
    setContent('');
    setAuthor('');
    setPublishedAt('');
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length || processing) return;
    const inputs: RawDocumentInput[] = [];
    for (const file of Array.from(files).slice(0, 10)) {
      const extension = file.name.split('.').pop()?.toLowerCase() ?? 'txt';
      const fileFormat = EXTENSION_FORMAT[extension] ?? 'text';
      const text = await file.text();
      inputs.push({
        title: file.name.replace(/\.[^.]+$/, ''),
        format: fileFormat,
        source,
        content: text.slice(0, 200_000),
      });
    }
    if (inputs.length) onIngest(inputs);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <form className="doc-form doc-card" onSubmit={submit} aria-label="Document ingestion">
      <h2>Ingest documents</h2>
      <p className="doc-muted">
        Markdown, HTML, and plain text are processed on-device. Secret keys are redacted
        automatically.
      </p>
      <div className="doc-form-row">
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Payments deep dive"
            required
            maxLength={160}
          />
        </label>
        <label>
          Format
          <select value={format} onChange={(event) => setFormat(event.target.value as DocumentFormat)}>
            {FORMATS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          Source type
          <select value={source} onChange={(event) => setSource(event.target.value as DocumentSourceKind)}>
            {SOURCES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="doc-form-row">
        <label>
          Author (optional)
          <input
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
            placeholder="forum username"
            maxLength={80}
          />
        </label>
        <label>
          Published (optional)
          <input
            type="date"
            value={publishedAt}
            onChange={(event) => setPublishedAt(event.target.value)}
          />
        </label>
      </div>
      <label>
        Content
        <textarea
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={'# Heading\n\nDocument body with fenced ```js code blocks…'}
          required
        />
      </label>
      <div className="doc-actions">
        <button type="submit" disabled={processing || !title.trim() || !content.trim()}>
          {processing ? 'Processing…' : 'Analyze document'}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={processing}>
          Upload files (.md .html .txt)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".md,.markdown,.txt,.html,.htm"
          multiple
          hidden
          onChange={(event) => void handleFiles(event.target.files)}
        />
        <small className="doc-muted">{content.length.toLocaleString()} characters</small>
      </div>
    </form>
  );
}
