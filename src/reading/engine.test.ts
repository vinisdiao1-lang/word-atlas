import assert from "node:assert/strict";
import { test } from "node:test";
import type { WordRef } from "../atlas/types";
import {
  isReadingCorrect,
  parseReadingImport,
  readingPrompt,
  readingSpans,
  recommendReadings,
  sanitizeReadingProgress,
  validateReadingPassage,
} from "./engine";
import { READING_PASSAGES } from "./passages";

const word = (name: string): WordRef => ({
  id: name,
  word: name,
  zh: "测试词义",
  ipa: "",
  cefr: 2,
  topic: 0,
  media: 0,
  order: 0,
});
const market = READING_PASSAGES.find((p) => p.id === "market-classroom")!;

test("all original exercises have valid evidence, answer formats and original-word completion answers", () => {
  assert.equal(
    new Set(READING_PASSAGES.map((p) => p.id)).size,
    READING_PASSAGES.length,
  );
  for (const passage of READING_PASSAGES) {
    const checked = validateReadingPassage(passage);
    assert.equal(checked.questions.length, 6, passage.title);
    assert.equal(checked.paragraphs.length, 4, passage.title);
    for (const question of passage.questions)
      assert.ok(
        isReadingCorrect(question, question.answer),
        `${passage.title}: ${question.id}`,
      );
    assert.deepEqual(
      new Set(
        passage.questions.filter((q) => q.type === "tfng").map((q) => q.answer),
      ),
      new Set(["TRUE", "FALSE", "NOT GIVEN"]),
      passage.title,
    );
  }
});

test("reading highlights complete words and common inflections without counting unrelated substrings", () => {
  const text =
    "An article about artists described children who studied and taught in schools.";
  const spans = readingSpans(text, [
    word("art"),
    word("child"),
    word("study"),
    word("teach"),
    word("school"),
  ]);
  assert.deepEqual(
    spans.map((s) => s.word.id),
    ["child", "study", "teach", "school"],
  );
  assert.deepEqual(
    spans.map((s) => text.slice(s.start, s.end)),
    ["children", "studied", "taught", "schools"],
  );
});

test("personal recommendations use the entire learned vocabulary and favour actual coverage", () => {
  const learned = ["hut", "sour", "currency", "qualification", "issue"].map(
    word,
  );
  const ranked = recommendReadings(READING_PASSAGES, learned);
  assert.equal(ranked[0].passage.id, market.id);
  assert.deepEqual(
    new Set(ranked[0].matches.map((w) => w.id)),
    new Set(learned.map((w) => w.id)),
  );
  assert.equal(
    recommendReadings(READING_PASSAGES, [word("xyzzy")])[0].matches.length,
    0,
  );
  assert.equal(
    recommendReadings(READING_PASSAGES, [])[0].passage.id,
    READING_PASSAGES[0].id,
  );
});

test("overlapping learned words produce non-overlapping, clickable text spans", () => {
  const text = "A public library lends tools.";
  const spans = readingSpans(text, [
    word("public"),
    word("public library"),
    word("library"),
  ]);
  assert.equal(spans.length, 1);
  assert.equal(text.slice(spans[0].start, spans[0].end), "public library");
});

test("completion grading ignores case and whitespace but enforces exact words and word limits", () => {
  const question = market.questions[5];
  assert.equal(isReadingCorrect(question, "  NATIONAL   CURRENCY "), true);
  assert.equal(isReadingCorrect(question, "the national currency"), false);
  assert.equal(isReadingCorrect(question, "foreign currency"), false);
  assert.equal(isReadingCorrect(question, ""), false);
});

test("custom article import accepts fenced JSON, has a stable ID and rejects unsupported answers or missing evidence", () => {
  const imported = parseReadingImport(
    `\u0060\u0060\u0060json\n${JSON.stringify(market)}\n\u0060\u0060\u0060`,
  );
  assert.equal(validateReadingPassage(imported).id, imported.id);
  const badEvidence = structuredClone(market);
  badEvidence.questions[0].evidence =
    "This quotation is absent from the passage.";
  assert.throws(() => validateReadingPassage(badEvidence), /evidence/);
  const badAnswer = structuredClone(market);
  badAnswer.questions[0].answer = "MAYBE";
  assert.throws(() => validateReadingPassage(badAnswer), /TRUE/);
  const badCompletion = structuredClone(market);
  badCompletion.questions[5].answer = "currenc";
  assert.throws(() => validateReadingPassage(badCompletion), /填空答案/);
  assert.throws(() => parseReadingImport("not JSON"), /JSON/);
  assert.throws(() => parseReadingImport("x".repeat(60001)), /60 KB/);
});

test("saved reading sessions and imported articles survive backup validation without accepting malformed records", () => {
  const custom = validateReadingPassage(market);
  const saved = sanitizeReadingProgress({
    custom: [custom, { title: "broken" }],
    sessions: {
      [custom.id]: {
        answers: { q1: "FALSE", q2: "TRUE", bad: "x", q3: 5 },
        startedAt: 100,
        submittedAt: 200,
      },
      broken: { startedAt: -1 },
    },
    history: [
      {
        passageId: custom.id,
        title: custom.title,
        score: 4,
        total: 6,
        at: 200,
      },
      { passageId: "x", title: "bad", score: 7, total: 6, at: 200 },
    ],
  });
  assert.equal(saved.custom.length, 1);
  assert.equal(saved.custom[0].id, custom.id);
  assert.deepEqual(saved.sessions[custom.id].answers, {
    q1: "FALSE",
    q2: "TRUE",
  });
  assert.equal(saved.sessions[custom.id].submittedAt, 200);
  assert.equal(saved.sessions.broken, undefined);
  assert.equal(saved.history.length, 1);
});

test("personal article prompts include only the chosen vocabulary, difficulty and strict import schema", () => {
  const prompt = readingPrompt([word("currency"), word("qualification")], "B1");
  assert.ok(prompt.includes("currency — 测试词义"));
  assert.ok(prompt.includes("qualification — 测试词义"));
  assert.ok(prompt.includes('"level": "B1"'));
  assert.ok(prompt.includes('"maxWords":2'));
});
