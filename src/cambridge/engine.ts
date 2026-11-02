export type Kind =
  "choice" | "judgment" | "heading" | "paragraph-match" | "summary" | "other";
export interface Group {
  from: number;
  to: number;
  type: Kind;
  instruction: string;
  anyOrder: boolean;
}
export interface Page {
  page: number;
  image: string;
}
export interface Paper {
  id: string;
  book: number;
  test: number;
  passage: number;
  title: string;
  text: string;
  numbers: number[];
  groups: Group[];
  answers: Record<string, string>;
  pages: Page[];
  answerPage: Page;
  sourceStart: number;
  sourceEnd: number;
  ocr: boolean;
}
export interface Pack {
  format: "word-atlas-cambridge-v1";
  book: number;
  passages: Paper[];
}
export interface Task {
  paperId: string;
  numbers: number[];
}
export interface Attempt {
  id: string;
  mode: "stage" | "mock";
  stage: number;
  tasks: Task[];
  answers: Record<string, string>;
  marks: Record<string, boolean>;
  notes: Record<string, string>;
  startedAt: number;
  submittedAt?: number;
  deadline?: number;
}
export interface Records {
  attempts: Attempt[];
  activeId: string | null;
}
export const RULES = [
  {
    name: "基础练习",
    types: ["choice", "judgment"],
    numerator: 11,
    denominator: 13,
  },
  {
    name: "段落结构",
    types: ["heading", "paragraph-match"],
    numerator: 10,
    denominator: 13,
  },
  {
    name: "综合理解",
    types: ["summary", "choice"],
    numerator: 8,
    denominator: 14,
  },
] as const;
export const kindLabel: Record<Kind, string> = {
  choice: "选择",
  judgment: "判断",
  heading: "Heading",
  "paragraph-match": "段落匹配",
  summary: "Summary",
  other: "其他原卷题型",
};
export const qid = (id: string, n: number) => `${id}:${n}`;
export const requiredCorrect = (stage: number, count: number) =>
  Math.ceil(
    (count * RULES[stage - 1].numerator) / RULES[stage - 1].denominator,
  );
export function stageNumbers(p: Paper, stage: number) {
  return p.numbers.filter((n) =>
    p.groups.some(
      (g) =>
        n >= g.from &&
        n <= g.to &&
        (RULES[stage - 1].types as readonly string[]).includes(g.type),
    ),
  );
}
const normal = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/not\s*given/g, "notgiven")
    .replace(/[’‘]/g, "'")
    .replace(/[{}|]/g, "")
    .replace(/(?<=\d),(?=\d)/g, "")
    .replace(/\s+/g, " ")
    .trim();
export function answerVariants(raw: string): string[] {
  const cleaned = raw.replace(/\s*\(?in either order\)?/gi, "").trim();
  if (cleaned.startsWith("(the) "))
    return answerVariants(cleaned.slice(6)).flatMap((v) => [v, `the ${v}`]);
  const optional = cleaned.match(/\(([^)]+)\)/);
  if (optional)
    return [
      ...answerVariants(cleaned.replace(optional[0], "")),
      ...answerVariants(cleaned.replace(optional[0], optional[1])),
    ];
  const parts = cleaned.split(/\s*\/\s*|\s+OR\s+/i);
  if (parts.length > 1) {
    if (/\s\/|\/\s|\sOR\s/i.test(cleaned)) return parts.map(normal);
    const firstWords = parts[0].split(" ");
    if (firstWords.length > 1 && parts.slice(1).every((p) => !p.includes(" ")))
      return parts.map((p, i) =>
        normal(i === 0 ? p : `${firstWords.slice(0, -1).join(" ")} ${p}`),
      );
    const lastWords = parts.at(-1)!.split(" ");
    if (
      lastWords.length > 1 &&
      parts.slice(0, -1).every((p) => !p.includes(" "))
    )
      return parts.map((p, i) =>
        normal(
          i === parts.length - 1 ? p : `${p} ${lastWords.slice(1).join(" ")}`,
        ),
      );
  }
  return parts.map(normal);
}
export function grade(a: Attempt, papers: Paper[]) {
  const marks: Record<string, boolean | null> = {};
  for (const task of a.tasks) {
    const p = papers.find((p) => p.id === task.paperId);
    if (!p) continue;
    for (const n of task.numbers) {
      const id = qid(p.id, n),
        value = a.answers[id] ?? "",
        key = p.answers[n] ?? "";
      marks[id] = !value.trim()
        ? false
        : !key.trim()
          ? null
          : answerVariants(key).includes(normal(value));
    }
    for (const g of p.groups.filter((g) => g.anyOrder)) {
      const nums = task.numbers.filter((n) => n >= g.from && n <= g.to);
      if (nums.length < 2) continue;
      const keys = nums.map((n) => p.answers[n]).filter(Boolean);
      if (keys.length !== nums.length) {
        nums.forEach((n) => {
          if (a.answers[qid(p.id, n)]?.trim()) marks[qid(p.id, n)] = null;
        });
        continue;
      }
      const available = keys.map(answerVariants);
      for (const n of nums) {
        const value = normal(a.answers[qid(p.id, n)] ?? "");
        const index = available.findIndex((k) => k.includes(value));
        marks[qid(p.id, n)] = index >= 0;
        if (index >= 0) available.splice(index, 1);
      }
    }
  }
  for (const [id, value] of Object.entries(a.marks))
    if (id in marks) marks[id] = value;
  const values = Object.values(marks);
  return {
    marks,
    correct: values.filter((v) => v === true).length,
    pending: values.filter((v) => v === null).length,
    total: a.tasks.reduce((s, t) => s + t.numbers.length, 0),
  };
}
export function passed(a: Attempt, papers: Paper[]) {
  const g = grade(a, papers);
  return (
    a.mode === "stage" &&
    !!a.submittedAt &&
    g.total > 0 &&
    g.pending === 0 &&
    g.correct >= requiredCorrect(a.stage, g.total)
  );
}
export function validatePack(v: unknown): Pack {
  if (!v || typeof v !== "object") throw Error("不是有效的题库文件。");
  const p = v as Pack;
  if (
    p.format !== "word-atlas-cambridge-v1" ||
    !Number.isInteger(p.book) ||
    p.book < 11 ||
    p.book > 19 ||
    !Array.isArray(p.passages) ||
    p.passages.length !== 12
  )
    throw Error("需要完整的剑桥阅读题库（每册 4 套、12 篇）。");
  const ids = new Set<string>();
  for (const x of p.passages) {
    if (
      x.id !== `c${p.book}-t${x.test}-p${x.passage}` ||
      ids.has(x.id) ||
      ![1, 2, 3, 4].includes(x.test) ||
      ![1, 2, 3].includes(x.passage) ||
      typeof x.title !== "string" ||
      typeof x.text !== "string" ||
      x.text.length > 100000 ||
      !Array.isArray(x.numbers) ||
      !x.numbers.length ||
      new Set(x.numbers).size !== x.numbers.length ||
      x.numbers.some((n) => !Number.isInteger(n) || n < 1 || n > 40) ||
      !Array.isArray(x.groups) ||
      !x.answers ||
      typeof x.answers !== "object"
    )
      throw Error("文章结构或原卷题号不完整。");
    ids.add(x.id);
    if (
      x.groups.some(
        (g) =>
          !g ||
          !(g.type in kindLabel) ||
          !Number.isInteger(g.from) ||
          !Number.isInteger(g.to) ||
          g.from < 1 ||
          g.to > 40 ||
          g.from > g.to,
      )
    )
      throw Error("题型分组无效。");
    if (
      Object.values(x.answers).some(
        (s) => typeof s !== "string" || s.length > 300,
      )
    )
      throw Error("答案格式无效。");
    if (
      !Array.isArray(x.pages) ||
      !x.pages.length ||
      x.pages.length > 12 ||
      !x.answerPage
    )
      throw Error("缺少阅读或答案原页。");
    for (const page of [...x.pages, x.answerPage])
      if (
        !Number.isInteger(page.page) ||
        typeof page.image !== "string" ||
        !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(page.image) ||
        page.image.length > 5000000
      )
        throw Error("原页图片格式无效。");
  }
  for (let test = 1; test <= 4; test++) {
    const nums = p.passages
      .filter((x) => x.test === test)
      .flatMap((x) => x.numbers)
      .sort((a, b) => a - b);
    if (nums.length !== 40 || nums.some((n, i) => n !== i + 1))
      throw Error(`第 ${test} 套题号未覆盖 1–40，请先核对提取结果。`);
  }
  return p;
}
