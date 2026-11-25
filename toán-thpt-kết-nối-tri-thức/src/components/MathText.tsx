import React from 'react';
import katex from 'katex';

interface MathBlockProps {
  latex: string;
  displayMode?: boolean;
  className?: string;
}

export const MathBlock: React.FC<MathBlockProps> = ({
  latex,
  displayMode = true,
  className = '',
}) => {
  const html = React.useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode,
        throwOnError: false,
        strict: false,
      });
    } catch {
      return latex;
    }
  }, [latex, displayMode]);

  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Splits text into plain text segments and LaTeX math segments ($...$ or $$...$$),
 * rendering math cleanly with KaTeX while preserving plain text safely.
 */
function renderFormattedLine(line: string): React.ReactNode[] {
  const segments = line.split(/(\*\*[^*]+?\*\*)/g);
  return segments.map((seg, i) => {
    if (seg.startsWith('**') && seg.endsWith('**') && seg.length > 4) {
      return (
        <strong key={i} className="font-semibold">
          {seg.slice(2, -2)}
        </strong>
      );
    }
    return <React.Fragment key={i}>{seg}</React.Fragment>;
  });
}

export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  const parts = React.useMemo(() => {
    if (!text) return [];
    const normalizedText = text
      .replace(/\\\(([\s\S]+?)\\\)/g, '$$$1$$')
      .replace(/\\\[([\s\S]+?)\\\]/g, '$$$$1$$$$');
    // Match $$...$$ first, then $...$
    const regex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;
    const tokens: Array<{ type: 'text' | 'inline' | 'block'; value: string }> = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(normalizedText)) !== null) {
      if (match.index > lastIndex) {
        tokens.push({
          type: 'text',
          value: normalizedText.slice(lastIndex, match.index),
        });
      }
      const raw = match[0];
      if (raw.startsWith('$$') && raw.endsWith('$$')) {
        tokens.push({
          type: 'block',
          value: raw.slice(2, -2).trim(),
        });
      } else {
        tokens.push({
          type: 'inline',
          value: raw.slice(1, -1).trim(),
        });
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < normalizedText.length) {
      tokens.push({
        type: 'text',
        value: normalizedText.slice(lastIndex),
      });
    }
    return tokens;
  }, [text]);

  return (
    <span className={className}>
      {parts.map((part, idx) => {
        if (part.type === 'text') {
          return (
            <React.Fragment key={idx}>
              {part.value.split('\n').map((line, lIdx, arr) => (
                <React.Fragment key={lIdx}>
                  {renderFormattedLine(line)}
                  {lIdx < arr.length - 1 && <br />}
                </React.Fragment>
              ))}
            </React.Fragment>
          );
        }
        return (
          <MathBlock
            key={idx}
            latex={part.value}
            displayMode={part.type === 'block'}
            className={part.type === 'block' ? 'block my-2' : 'inline align-baseline mx-0.5'}
          />
        );
      })}
    </span>
  );
};
