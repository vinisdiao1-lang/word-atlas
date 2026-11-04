import { useMemo, type ReactNode } from "react";
import type { WordRef } from "../atlas/types";
import { readingSpans } from "../reading/engine";
export function ExamText({
  paragraphs,
  article = false,
  renderGap,
  paragraphId,
  highlightWords,
}: {
  paragraphs: string[];
  article?: boolean;
  renderGap?: (number: number) => ReactNode;
  paragraphId?: (index: number) => string;
  highlightWords?: WordRef[];
}) {
  const highlights = useMemo(() => {
    if (!highlightWords?.length) return [];
    const spans = readingSpans(paragraphs.join("\n"), highlightWords);
    let offset = 0;
    return paragraphs.map((text) => {
      const local = spans
        .filter(
          (span) => span.start >= offset && span.end <= offset + text.length,
        )
        .map((span) => ({
          ...span,
          start: span.start - offset,
          end: span.end - offset,
        }));
      offset += text.length + 1;
      return local;
    });
  }, [paragraphs, highlightWords]);
  const highlighted = (text: string, index: number, prefix: number) => {
    const nodes: ReactNode[] = [];
    let end = 0;
    for (const span of highlights[index] ?? []) {
      const start = span.start - prefix;
      if (start < 0) continue;
      const finish = span.end - prefix;
      nodes.push(text.slice(end, start));
      nodes.push(
        <mark
          className="exam-learned-highlight"
          key={start}
          title={`${span.word.word} · ${span.word.zh}`}
        >
          {text.slice(start, finish)}
        </mark>,
      );
      end = finish;
    }
    nodes.push(text.slice(end));
    return nodes;
  };
  const content = (text: string, index: number, prefix = 0) =>
    !renderGap
      ? highlighted(text, index, prefix)
      : text.split(/(\{\{\d+\}\})/g).map((part, i) => {
          const gap = part.match(/^\{\{(\d+)\}\}$/);
          return <span key={i}>{gap ? renderGap(Number(gap[1])) : part}</span>;
        });
  return (
    <div className="exam-prose">
      {paragraphs.map((text, i) => {
        const label = text.match(
          article ? /^([A-K])\s+([A-Z'“‘"].+)/ : /^([A-K]|[ivx]{1,4})\s+(.+)/,
        );
        return (
          <p
            id={paragraphId?.(i)}
            tabIndex={paragraphId ? -1 : undefined}
            key={i}
            className={label ? "exam-labeled-text" : undefined}
          >
            {label ? (
              <>
                <b className="exam-text-label">{label[1]}</b>
                <span>{content(label[2], i, text.indexOf(label[2]))}</span>
              </>
            ) : (
              content(text, i)
            )}
          </p>
        );
      })}
    </div>
  );
}
