import React, { useState } from 'react';
import { Check, Code2, Copy, Eye } from 'lucide-react';
import {
  InlineSegment,
  parseInlineSegments,
  parseMarkdownBlocks,
} from '../utils/markdownParser';

interface MarkdownMessageProps {
  content: string;
}

function renderInline(text: string): React.ReactNode {
  const segments: InlineSegment[] = parseInlineSegments(text);
  return segments.map((seg, idx) => {
    if (seg.type === 'bold') {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-slate-100">
          {seg.value}
        </strong>
      );
    }
    if (seg.type === 'code') {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-teal-300 font-mono text-[12px] border border-slate-200 dark:border-slate-700"
        >
          {seg.value}
        </code>
      );
    }
    return <React.Fragment key={idx}>{seg.value}</React.Fragment>;
  });
}

const CodeBlock: React.FC<{ language: string; code: string }> = ({
  language,
  code,
}) => {
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const normalizedLang = (language || 'code').toLowerCase();
  const isPreviewable = normalizedLang === 'html' || normalizedLang === 'svg';
  const lineCount = code.split('\n').length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Ignore clipboard failures in restricted environments
    }
  };

  const sandboxDocument =
    normalizedLang === 'svg'
      ? `<!doctype html><html><body style="margin:0;padding:16px;background:#ffffff;display:flex;justify-content:center;">${code}</body></html>`
      : `<!doctype html><html><body style="margin:0;padding:14px;background:#ffffff;font-family:system-ui,sans-serif;">${code}</body></html>`;

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 my-2">
      <div className="flex items-center justify-between gap-2 px-3.5 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] text-slate-400">
        <span className="font-mono lowercase tabular-nums">
          {normalizedLang} · {lineCount} lines
        </span>

        <div className="flex items-center gap-3 shrink-0">
          {isPreviewable && (
            <button
              type="button"
              onClick={() => setShowPreview((v) => !v)}
              aria-label={showPreview ? 'Show code source' : 'Preview rendered output'}
              className="inline-flex items-center gap-1 text-teal-400 hover:text-teal-300 transition-colors cursor-pointer whitespace-nowrap"
            >
              {showPreview ? (
                <>
                  <Code2 className="w-3 h-3" aria-hidden="true" />
                  <span>Code</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" aria-hidden="true" />
                  <span>Preview</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            onClick={handleCopy}
            aria-label={`Copy ${normalizedLang} block`}
            className="inline-flex items-center gap-1 text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-teal-400" aria-hidden="true" />
                <span className="text-teal-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" aria-hidden="true" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {showPreview && isPreviewable ? (
        <div className="bg-white p-1">
          <iframe
            title={`${normalizedLang} live preview`}
            sandbox="allow-scripts"
            srcDoc={sandboxDocument}
            className="w-full h-56 border-0 rounded"
          />
        </div>
      ) : (
        <pre className="p-3.5 overflow-x-auto text-[12.5px] leading-relaxed font-mono">
          <code>{code}</code>
        </pre>
      )}
    </div>
  );
};

export const MarkdownMessage: React.FC<MarkdownMessageProps> = ({ content }) => {
  const blocks = parseMarkdownBlocks(content);

  return (
    <div className="space-y-2.5 text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return (
            <CodeBlock
              key={idx}
              language={block.language}
              code={block.code}
            />
          );
        }

        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-base font-bold'
              : block.level === 2
              ? 'text-[15px] font-semibold'
              : 'text-sm font-semibold';
          return (
            <h4
              key={idx}
              className={`${sizeClass} text-slate-900 dark:text-slate-100 font-display pt-1`}
            >
              {renderInline(block.text)}
            </h4>
          );
        }

        if (block.type === 'blockquote') {
          return (
            <blockquote
              key={idx}
              className="pl-3.5 py-1 text-slate-600 dark:text-slate-300 italic border-l-2 border-teal-600/60 dark:border-teal-400/60"
            >
              {renderInline(block.text)}
            </blockquote>
          );
        }

        if (block.type === 'list') {
          const ListTag = block.ordered ? 'ol' : 'ul';
          return (
            <ListTag
              key={idx}
              className={`space-y-1 pl-5 ${
                block.ordered ? 'list-decimal' : 'list-disc'
              } marker:text-slate-400 dark:marker:text-slate-500`}
            >
              {block.items.map((item, itemIdx) => (
                <li key={itemIdx} className="leading-relaxed">
                  {renderInline(item)}
                </li>
              ))}
            </ListTag>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap leading-relaxed">
            {renderInline(block.text)}
          </p>
        );
      })}
    </div>
  );
};
