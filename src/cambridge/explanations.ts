import {
  unorderedAnswersFor,
  acceptedAnswerVariants,
  answerVariants,
  answerWordLimit,
  type Paper,
} from "./engine";

export interface Explanation {
  answer: string;
  stem: string;
  evidence: { paragraph: number; quote: string }[];
  reasoning: string[];
  paraphrases: { question: string; passage: string; explanation: string }[];
  traps: string[];
  options?: { label: string; correct: boolean; reason: string }[];
  reviewTip: string;
  verificationNote?: string;
}
export interface ExplanationBook {
  format: "word-atlas-explanations-v1";
  book: number;
  items: Record<string, Explanation>;
}
export function explanationAnswerLabel(paper: Paper, number: number): string {
  const numbers = unorderedAnswersFor(paper, number);
  return numbers
    ? `${numbers.map((n) => paper.answers[n]).join("、")}（本组答案，顺序不限）`
    : answerVariants(paper.answers[number]).some(
          (variant) => !acceptedAnswerVariants(paper, number).includes(variant),
        )
      ? `${paper.answers[number]}（最多${answerWordLimit(paper, number)}词）`
      : paper.answers[number];
}
const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length < 20000;
export function validateExplanation(
  value: unknown,
  paper: Paper,
  number: number,
): Explanation {
  if (!value || typeof value !== "object") throw Error("本题解析暂不可用。");
  const e = value as Explanation;
  if (!isText(e.answer) || e.answer.trim() !== paper.answers[number]?.trim())
    throw Error("本题解析与答案版本不一致，请核对原始答案页。");
  if (e.verificationNote !== undefined && !isText(e.verificationNote))
    throw Error("本题答案核验说明无效。");
  if (
    !isText(e.stem) ||
    !Array.isArray(e.reasoning) ||
    e.reasoning.length < 2 ||
    !e.reasoning.every(isText) ||
    !Array.isArray(e.traps) ||
    !e.traps.length ||
    !e.traps.every(isText) ||
    !isText(e.reviewTip)
  )
    throw Error("本题解析内容不完整。");
  if (
    !Array.isArray(e.evidence) ||
    !e.evidence.length ||
    e.evidence.some(
      (item) =>
        !Number.isInteger(item.paragraph) ||
        !isText(item.quote) ||
        !paper.reading?.paragraphs[item.paragraph - 1]?.includes(item.quote),
    )
  )
    throw Error("本题原文证据暂未通过核对。");
  if (
    !Array.isArray(e.paraphrases) ||
    e.paraphrases.some(
      (p) =>
        !isText(p.question) || !isText(p.passage) || !isText(p.explanation),
    )
  )
    throw Error("本题同义改写内容无效。");
  if (
    e.options &&
    (!Array.isArray(e.options) ||
      e.options.some(
        (o) =>
          !isText(o.label) ||
          typeof o.correct !== "boolean" ||
          !isText(o.reason),
      ))
  )
    throw Error("本题选项分析无效。");
  return e;
}
const books = new Map<number, Promise<ExplanationBook>>();
export function loadExplanationBook(book: number): Promise<ExplanationBook> {
  let request = books.get(book);
  if (!request) {
    request = fetch(
      `${import.meta.env.BASE_URL}cambridge/explanations/c${book}.json?v=review3-20261104`,
    )
      .then(async (response) => {
        if (!response.ok)
          throw Error("详细解析暂时加载失败，请检查网络后重试。");
        const data = (await response.json()) as ExplanationBook;
        if (
          data.format !== "word-atlas-explanations-v1" ||
          data.book !== book ||
          !data.items ||
          typeof data.items !== "object"
        )
          throw Error("解析文件格式无效。");
        return data;
      })
      .catch((error: unknown) => {
        books.delete(book);
        throw error;
      });
    books.set(book, request);
  }
  return request;
}
