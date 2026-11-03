import type { ReactNode } from "react";
export function ExamText({
  paragraphs,
  article = false,
  renderGap,
}: {
  paragraphs: string[];
  article?: boolean;
  renderGap?: (number: number) => ReactNode;
}) {
  const content = (text: string) =>
    !renderGap
      ? text
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
          <p key={i} className={label ? "exam-labeled-text" : undefined}>
            {label ? (
              <>
                <b className="exam-text-label">{label[1]}</b>
                <span>{content(label[2])}</span>
              </>
            ) : (
              content(text)
            )}
          </p>
        );
      })}
    </div>
  );
}
