import type { WordRef } from "../atlas/types";
import { hashSeed, normalize } from "../lib/text";
import {
  emptyReading,
  type ReadingPassage,
  type ReadingProgress,
  type ReadingQuestion,
} from "./types";

const irregular: Record<string, string[]> = {
  be: ["is", "are", "was", "were", "been"],
  have: ["has", "had"],
  do: ["does", "did", "done"],
  teach: ["taught"],
  learn: ["learnt", "learned"],
  go: ["went", "gone"],
  write: ["wrote", "written"],
  read: ["read"],
  buy: ["bought"],
  bring: ["brought"],
  build: ["built"],
  make: ["made"],
  find: ["found"],
  think: ["thought"],
  take: ["took", "taken"],
  give: ["gave", "given"],
  see: ["saw", "seen"],
  grow: ["grew", "grown"],
  choose: ["chose", "chosen"],
  keep: ["kept"],
  leave: ["left"],
  meet: ["met"],
  spend: ["spent"],
  sell: ["sold"],
  run: ["ran", "running"],
  child: ["children"],
  person: ["people"],
  woman: ["women"],
  man: ["men"],
  foot: ["feet"],
  tooth: ["teeth"],
};

/** Conservative forms: no stem matching that would count “article” as “art”. */
export function readingWordForms(word: string) {
  const base = normalize(word);
  const forms = new Set([base, ...(irregular[base] ?? [])]);
  if (/^[a-z]+$/.test(base) && base.length > 2) {
    forms.add(
      /[^aeiou]y$/.test(base)
        ? `${base.slice(0, -1)}ies`
        : /(?:s|x|z|ch|sh)$/.test(base)
          ? `${base}es`
          : `${base}s`,
    );
    forms.add(
      /[^aeiou]y$/.test(base)
        ? `${base.slice(0, -1)}ied`
        : base.endsWith("e")
          ? `${base}d`
          : `${base}ed`,
    );
    forms.add(
      base.endsWith("ie")
        ? `${base.slice(0, -2)}ying`
        : base.endsWith("e") && !base.endsWith("ee")
          ? `${base.slice(0, -1)}ing`
          : `${base}ing`,
    );
    if (/[^aeiou][aeiou][bdgmnprt]$/.test(base)) {
      forms.add(`${base}${base.at(-1)}ing`);
      forms.add(`${base}${base.at(-1)}ed`);
    }
  }
  return [...forms];
}

export function readingWordPattern(word: string) {
  const escaped = readingWordForms(word)
    .sort((a, b) => b.length - a.length)
    .map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`(?<![A-Za-z])(?:${escaped.join("|")})(?![A-Za-z])`, "gi");
}

export function prepareVocabulary(words: WordRef[]) {
  return words.map((word) => ({
    word,
    pattern: readingWordPattern(word.word),
  }));
}

export function passageMatches(
  passage: ReadingPassage,
  vocabulary: ReturnType<typeof prepareVocabulary>,
) {
  const text = passage.paragraphs.join("\n");
  return vocabulary
    .filter(({ pattern }) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    })
    .map(({ word }) => word);
}

export function recommendReadings(
  passages: ReadingPassage[],
  words: WordRef[],
  weakIds: Set<string> = new Set(),
  completedIds: Set<string> = new Set(),
) {
  const vocabulary = prepareVocabulary(words);
  return passages
    .map((passage, order) => {
      const matches = passageMatches(passage, vocabulary);
      return {
        passage,
        matches,
        weak: matches.filter((w) => weakIds.has(w.id)).length,
        completed: completedIds.has(passage.id),
        order,
      };
    })
    .sort(
      (a, b) =>
        b.matches.length - a.matches.length ||
        b.weak - a.weak ||
        Number(a.completed) - Number(b.completed) ||
        a.order - b.order,
    );
}

export function readingSpans(text: string, words: WordRef[]) {
  const found: { start: number; end: number; word: WordRef }[] = [];
  for (const word of words) {
    for (const match of text.matchAll(readingWordPattern(word.word)))
      found.push({
        start: match.index,
        end: match.index + match[0].length,
        word,
      });
  }
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  let end = 0;
  return found.filter((span) => {
    if (span.start < end) return false;
    end = span.end;
    return true;
  });
}

export const readingWordCount = (passage: ReadingPassage) =>
  (passage.paragraphs.join(" ").match(/[A-Za-z]+(?:['’-][A-Za-z]+)*/g) ?? [])
    .length;

export function isReadingCorrect(
  question: ReadingQuestion,
  value: string | undefined,
) {
  const answer = normalize(value ?? "");
  if (!answer) return false;
  if (
    question.type === "completion" &&
    answer.split(/\s+/).length > (question.maxWords ?? 2)
  )
    return false;
  return answer === normalize(question.answer);
}

const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string =>
  typeof v === "string" && !!v.trim() && v.length <= max;

/** The same validation is used for pasted AI output and restored backups. */
export function validateReadingPassage(value: unknown): ReadingPassage {
  if (
    !object(value) ||
    !text(value.title, 160) ||
    !text(value.topic, 60) ||
    !["B1", "B2", "C1"].includes(String(value.level))
  )
    throw new Error("文章需要 title、topic，以及 B1 / B2 / C1 之一的 level。");
  if (
    !Array.isArray(value.paragraphs) ||
    value.paragraphs.length < 3 ||
    value.paragraphs.length > 8 ||
    !value.paragraphs.every((p) => text(p, 5000))
  )
    throw new Error("paragraphs 需要包含 3–8 个非空英文段落。");
  const paragraphs = value.paragraphs.map((p: string) => p.trim());
  if (
    !Array.isArray(value.questions) ||
    value.questions.length < 3 ||
    value.questions.length > 12
  )
    throw new Error("questions 需要包含 3–12 道题。");
  const questions: ReadingQuestion[] = value.questions.map((q, i) => {
    if (
      !object(q) ||
      !["tfng", "choice", "completion"].includes(String(q.type)) ||
      !text(q.prompt, 1000) ||
      !text(q.answer, 200) ||
      !text(q.explanation, 2000)
    )
      throw new Error(`第 ${i + 1} 题缺少题型、题干、答案或中文解析。`);
    if (
      !Number.isInteger(q.paragraph) ||
      Number(q.paragraph) < 0 ||
      Number(q.paragraph) >= paragraphs.length ||
      !text(q.evidence, 1500) ||
      !paragraphs[Number(q.paragraph)].includes(q.evidence)
    )
      throw new Error(
        `第 ${i + 1} 题的 evidence 必须逐字出现在 paragraph 指向的段落中（段落从 0 编号）。`,
      );
    const type = q.type as ReadingQuestion["type"];
    const answer = q.answer.trim();
    if (type === "tfng" && !["TRUE", "FALSE", "NOT GIVEN"].includes(answer))
      throw new Error(`第 ${i + 1} 题答案须为 TRUE、FALSE 或 NOT GIVEN。`);
    if (
      type === "choice" &&
      (!Array.isArray(q.options) ||
        q.options.length !== 4 ||
        !q.options.every((p) => text(p, 500)) ||
        !["A", "B", "C", "D"].includes(answer))
    )
      throw new Error(`第 ${i + 1} 题需要 4 个选项，答案须为 A / B / C / D。`);
    const exactAnswer = new RegExp(
      `(?<![A-Za-z])${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![A-Za-z])`,
      "i",
    );
    if (
      type === "completion" &&
      (!Number.isInteger(q.maxWords) ||
        Number(q.maxWords) < 1 ||
        Number(q.maxWords) > 3 ||
        answer.split(/\s+/).length > Number(q.maxWords) ||
        !exactAnswer.test(paragraphs[Number(q.paragraph)]))
    )
      throw new Error(
        `第 ${i + 1} 题填空答案必须取自对应原文，且不超过 maxWords（1–3 词）。`,
      );
    return {
      id: `q${i + 1}`,
      type,
      prompt: q.prompt.trim(),
      answer,
      paragraph: Number(q.paragraph),
      evidence: q.evidence.trim(),
      explanation: q.explanation.trim(),
      ...(type === "choice"
        ? { options: (q.options as string[]).map((s) => s.trim()) }
        : {}),
      ...(type === "completion" ? { maxWords: Number(q.maxWords) } : {}),
    };
  });
  const passage = {
    id: "",
    title: value.title.trim(),
    topic: value.topic.trim(),
    level: value.level as ReadingPassage["level"],
    paragraphs,
    questions,
  };
  const count = readingWordCount(passage);
  if (count < 150 || count > 1000)
    throw new Error("文章正文需要 150–1,000 个英文词。");
  passage.id = `custom-${hashSeed(JSON.stringify(passage))}`;
  return passage;
}

export function parseReadingImport(raw: string) {
  if (raw.length > 60000 || new TextEncoder().encode(raw).byteLength > 60000)
    throw new Error("文章文件过大，请控制在 60 KB 以内。");
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    throw new Error(
      "未识别到有效 JSON。请复制 AI 返回的完整 JSON，包含最外层的大括号。",
    );
  }
  return validateReadingPassage(value);
}

export function sanitizeReadingProgress(value: unknown): ReadingProgress {
  const result = emptyReading();
  if (!object(value)) return result;
  if (Array.isArray(value.custom)) {
    for (const item of value.custom.slice(-10)) {
      try {
        const passage = validateReadingPassage(item);
        if (!result.custom.some((p) => p.id === passage.id))
          result.custom.push(passage);
      } catch {
        /* Ignore invalid imported articles in backups. */
      }
    }
  }
  if (object(value.sessions)) {
    for (const [id, session] of Object.entries(value.sessions).slice(-100)) {
      if (
        !/^[a-z0-9-]{1,100}$/.test(id) ||
        !object(session) ||
        !object(session.answers) ||
        typeof session.startedAt !== "number" ||
        !Number.isFinite(session.startedAt) ||
        session.startedAt < 0
      )
        continue;
      const answers: Record<string, string> = {};
      for (const [key, answer] of Object.entries(session.answers))
        if (
          /^q\d{1,2}$/.test(key) &&
          typeof answer === "string" &&
          answer.length <= 200
        )
          answers[key] = answer;
      const at = session.submittedAt;
      result.sessions[id] = {
        answers,
        startedAt: session.startedAt,
        ...(typeof at === "number" &&
        Number.isFinite(at) &&
        at >= session.startedAt
          ? { submittedAt: at }
          : {}),
      };
    }
  }
  if (Array.isArray(value.history)) {
    for (const item of value.history.slice(-100)) {
      if (
        !object(item) ||
        !text(item.passageId, 100) ||
        !text(item.title, 160) ||
        typeof item.at !== "number" ||
        !Number.isFinite(item.at) ||
        item.at < 0 ||
        !Number.isInteger(item.score) ||
        !Number.isInteger(item.total) ||
        Number(item.total) < 3 ||
        Number(item.total) > 12 ||
        Number(item.score) < 0 ||
        Number(item.score) > Number(item.total)
      )
        continue;
      result.history.push({
        passageId: item.passageId,
        title: item.title,
        at: item.at,
        score: Number(item.score),
        total: Number(item.total),
      });
    }
  }
  return result;
}

export function readingPrompt(
  words: WordRef[],
  level: ReadingPassage["level"],
) {
  return `请用下面我已经学过的英语词汇，为我编写一篇原创雅思学术阅读风格短篇，难度 ${level}，正文 300–450 词，分为 4–5 个自然段。围绕一个连贯的主题，自然使用至少 ${Math.min(words.length, 8)} 个清单词（可用屈折变化），不要为了塞词而拼凑故事。其余词汇尽量常见。不要抄写真题，不要虚构有来源的研究数据。

已学词（最多 40 个，优先最近学过或答错的词）：
${words
  .slice(0, 40)
  .map((w) => `${w.word} — ${w.zh}`)
  .join("\n")}

请出 6 道题：3 道 TRUE/FALSE/NOT GIVEN、2 道四选一、1 道原文填空。判断题必须区分“与原文矛盾”和“原文未提及”；每种题内按原文顺序出题。填空严格限定 1–3 词。每题给中文解析和原文依据。NOT GIVEN 提供相关段落的原句，并在解析中说明缺少什么信息。短篇练习不换算雅思分数。

只返回一个合法 JSON 对象，不要加说明。结构如下（paragraph 为从 0 开始的段落编号；evidence 必须是该段中逐字一致的一段原文；每题都必须保留这些字段）：
{
  "title": "English title",
  "topic": "中文主题",
  "level": "${level}",
  "paragraphs": ["Paragraph A...", "Paragraph B...", "Paragraph C...", "Paragraph D..."],
  "questions": [
    {"type":"tfng","prompt":"English statement","answer":"TRUE","paragraph":0,"evidence":"Exact quotation from paragraph A","explanation":"中文解析"},
    {"type":"tfng","prompt":"English statement","answer":"FALSE","paragraph":1,"evidence":"Exact quotation from paragraph B","explanation":"中文解析"},
    {"type":"tfng","prompt":"English statement","answer":"NOT GIVEN","paragraph":2,"evidence":"Exact quotation from paragraph C","explanation":"中文解析"},
    {"type":"choice","prompt":"English question","options":["option A","option B","option C","option D"],"answer":"B","paragraph":1,"evidence":"Exact quotation from paragraph B","explanation":"中文解析"},
    {"type":"choice","prompt":"English question","options":["option A","option B","option C","option D"],"answer":"C","paragraph":3,"evidence":"Exact quotation from paragraph D","explanation":"中文解析"},
    {"type":"completion","prompt":"Complete this sentence: ... ____ ...","answer":"exact words","maxWords":2,"paragraph":3,"evidence":"Exact quotation containing the answer","explanation":"中文解析"}
  ]
}`;
}
