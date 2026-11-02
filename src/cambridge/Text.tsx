export function ExamText({
  paragraphs,
  article = false,
}: {
  paragraphs: string[];
  article?: boolean;
}) {
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
                <span>{label[2]}</span>
              </>
            ) : (
              text
            )}
          </p>
        );
      })}
    </div>
  );
}
