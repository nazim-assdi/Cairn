import React, { useMemo, useState } from 'react';
import { FileText, Search } from 'lucide-react';
import { DocumentChunk, VaultDocument } from '../types/workspace';
import { extractKeyMetrics, extractTopTerms } from '../utils/edgeEngine';
import { formatBytes } from '../utils/formatters';

interface DocumentInspectorProps {
  documents: VaultDocument[];
  chunks: DocumentChunk[];
  activeDocId: string | null;
  highlightedChunkId: string | null;
  onSelectDoc: (id: string) => void;
  onAskAboutDoc: (docName: string) => void;
}

export const DocumentInspector: React.FC<DocumentInspectorProps> = ({
  documents,
  chunks,
  activeDocId,
  highlightedChunkId,
  onSelectDoc,
  onAskAboutDoc,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const activeDoc =
    documents.find((d) => d.id === activeDocId) ?? documents[0] ?? null;

  const docChunks = useMemo(() => {
    if (!activeDoc) return [];
    const list = chunks.filter((c) => c.documentId === activeDoc.id);
    const q = searchTerm.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (c) =>
        c.text.toLowerCase().includes(q) ||
        c.pageLabel.toLowerCase().includes(q)
    );
  }, [activeDoc, chunks, searchTerm]);

  const docFullText = useMemo(
    () => (activeDoc ? activeDoc.pages.map((p) => p.text).join('\n') : ''),
    [activeDoc]
  );

  const metrics = useMemo(
    () => extractKeyMetrics(docFullText, 6),
    [docFullText]
  );
  const topTerms = useMemo(
    () => extractTopTerms(docFullText, 6),
    [docFullText]
  );

  if (!activeDoc) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50 dark:bg-slate-950">
        <div className="text-center max-w-sm space-y-2">
          <FileText className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" aria-hidden="true" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            No documents to inspect
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Upload a PDF, DOCX, or TXT file in the sidebar to inspect extracted pages, indexed chunks, and detected metrics.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-slate-950 overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Document Picker & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <label htmlFor="inspector-doc-select" className="sr-only">
                Select document to inspect
              </label>
              <select
                id="inspector-doc-select"
                value={activeDoc.id}
                onChange={(e) => onSelectDoc(e.target.value)}
                className="text-base font-semibold text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 max-w-full"
              >
                {documents.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span className="uppercase">{activeDoc.format}</span>
              <span aria-hidden="true"> · </span>
              <span>{formatBytes(activeDoc.sizeBytes)}</span>
              <span aria-hidden="true"> · </span>
              <span>{activeDoc.pageCount} sections/pages</span>
              <span aria-hidden="true"> · </span>
              <span>{activeDoc.wordCount} words</span>
              <span aria-hidden="true"> · </span>
              <span>{activeDoc.chunkCount} indexed chunks</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onAskAboutDoc(activeDoc.name)}
            className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Summarize in Chat
          </button>
        </div>

        {/* Extracted Insights Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Detected figures & dates
            </h3>
            {metrics.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No numeric figures detected.</p>
            ) : (
              <div className="text-xs text-slate-800 dark:text-slate-200 font-mono tabular-nums leading-relaxed">
                {metrics.join(' · ')}
              </div>
            )}
          </div>

          <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Dominant local index terms
            </h3>
            {topTerms.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No terms indexed.</p>
            ) : (
              <div className="text-xs text-slate-800 dark:text-slate-200 tabular-nums leading-relaxed">
                {topTerms.map((t) => `${t.term} (${t.count})`).join(' · ')}
              </div>
            )}
          </div>
        </div>

        {/* Live Search Across Chunks */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Indexed passages ({docChunks.length})
            </h3>
            <div className="relative w-full sm:w-72">
              <Search
                className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <label htmlFor="inspector-chunk-search" className="sr-only">
                Filter indexed passages
              </label>
              <input
                id="inspector-chunk-search"
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Filter text or page label..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-teal-700"
              />
            </div>
          </div>

          {docChunks.length === 0 ? (
            <div className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No passages match "{searchTerm}".
            </div>
          ) : (
            <div className="space-y-3" data-testid="inspector-chunks">
              {docChunks.map((chunk) => {
                const isHighlighted = chunk.id === highlightedChunkId;
                return (
                  <div
                    key={chunk.id}
                    className={`rounded-lg bg-white dark:bg-slate-900 border p-4 space-y-1.5 transition-colors ${
                      isHighlighted
                        ? 'border-teal-600 dark:border-teal-500 ring-2 ring-teal-700/15 dark:ring-teal-500/20'
                        : 'border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {chunk.pageLabel} · Chunk {chunk.chunkIndex + 1}
                      </span>
                      <span>{chunk.wordCount} words</span>
                    </div>
                    <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                      {chunk.text}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
