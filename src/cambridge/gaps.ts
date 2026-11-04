import type { Group, QuestionText } from "./engine";

export function gapParagraphs(
  group: Group,
  section: QuestionText,
): string[] | null {
  const directions = section.paragraphs.slice(0, 4).join(" ");
  if (!(
    group.type === "summary" ||
    /(?:Complete (?:the|these|this|a) (?:notes|table|sentences|summary|flow)|Label the diagrams?)/i.test(
      directions,
    )
  ))
    return null;
  const paragraphs = [...section.paragraphs];
  let start = 0;
  for (let i = 0; i < Math.min(4, paragraphs.length); i++)
    if (/^(?:Complete|Choose|Write)\b/.test(paragraphs[i])) start = i + 1;
  const sentence = /Complete (?:the|these) sentences/i.test(directions);
  if (sentence) {
    const joined = paragraphs.slice(start).join("\n");
    const pattern = new RegExp(
      `(^|\\n)(${Array.from({ length: group.to - group.from + 1 }, (_, i) => i + group.from).join("|")})\\s+`,
      "g",
    );
    const matches = [...joined.matchAll(pattern)];
    const body: string[] = [];
    if (matches[0]?.index) body.push(joined.slice(0, matches[0].index));
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i],
        n = Number(match[2]);
      let text = joined
        .slice(
          match.index! + match[0].length,
          matches[i + 1]?.index ?? joined.length,
        )
        .replace(/\n/g, " ");
      const blank = /[._…·]{2,}(?:\s*[._…·]+)*/;
      text = blank.test(text)
        ? text.replace(blank, `{{${n}}}`)
        : `${text.replace(/[.]$/, "")} {{${n}}}.`;
      body.push(`${n} ${text}`);
    }
    return [...paragraphs.slice(0, start), ...body];
  }
  const seen = new Set<number>();
  // Visible answer leaders take priority over ordinary quantities such as
  // "leaves up to 6 metres long" appearing before question 6 in a table.
  for (let i = start; i < paragraphs.length; i++) {
    paragraphs[i] = paragraphs[i].replace(
      /\b(\d{1,2})(?![\dA-Za-z%]|,\d)\s*[._…·]{2,}(?:\s*[._…·]+)*/g,
      (raw, number) => {
        const n = Number(number);
        if (n < group.from || n > group.to || seen.has(n)) return raw;
        seen.add(n);
        return `{{${n}}}`;
      },
    );
  }
  for (let i = start; i < paragraphs.length; i++) {
    if (/^(?:Stage|Step|Phase)\s+\d+\s*:\s*$/i.test(paragraphs[i])) continue;
    paragraphs[i] = paragraphs[i].replace(
      /\b(\d{1,2})(?![\dA-Za-z%]|,\d)(?:\s*[._…·]+)*/g,
      (raw, number) => {
        const n = Number(number);
        if (n < group.from || n > group.to || seen.has(n)) return raw;
        seen.add(n);
        return `{{${n}}}`;
      },
    );
  }
  return paragraphs;
}

export function gapNumbers(paragraphs: string[]): number[] {
  return paragraphs.flatMap((p) =>
    [...p.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])),
  );
}
