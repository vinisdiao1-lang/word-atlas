import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  requiredCorrect,
  stageNumbers,
  grade,
  answerVariants,
  acceptedAnswerVariants,
  answerWordLimit,
  type Paper,
  type Attempt,
} from "./engine";
const p: Paper = {
  id: "c11-t1-p1",
  book: 11,
  test: 1,
  passage: 1,
  title: "test",
  text: "example",
  numbers: [1, 2, 3],
  groups: [
    {
      from: 1,
      to: 2,
      type: "choice",
      instruction: "Choose TWO letters",
      anyOrder: true,
    },
    { from: 3, to: 3, type: "judgment", instruction: "", anyOrder: false },
  ],
  answers: { 1: "B", 2: "D", 3: "NOT GIVEN" },
  pages: [],
  answerPage: { page: 1, image: "" },
  sourceStart: 1,
  sourceEnd: 1,
  ocr: false,
};
const attempt = (answers: Record<string, string>): Attempt => ({
  id: "x",
  mode: "stage",
  stage: 1,
  tasks: [{ paperId: p.id, numbers: p.numbers }],
  answers,
  notes: {},
  marks: {},
  startedAt: 1,
});
test("optional words do not override the source question's two-word limit", () => {
  const books = JSON.parse(
    readFileSync("public/cambridge/v2/library.json", "utf8"),
  );
  const paper: Paper = books
    .find((b: { book: number }) => b.book === 16)
    .passages.find((p: Paper) => p.id === "c16-t4-p1");
  assert.equal(answerWordLimit(paper, 12), 2);
  const variants = acceptedAnswerVariants(paper, 12);
  for (const answer of [
    "architect",
    "architect's",
    "the architect",
    "the architect's",
    "architect name",
    "architect's name",
  ])
    assert.ok(variants.includes(answer), answer);
  for (const answer of ["the architect name", "the architect's name", "name"]) {
    assert.ok(!variants.includes(answer), answer);
    const record = {
      ...attempt({ [paper.id + ":12"]: answer }),
      tasks: [{ paperId: paper.id, numbers: [12] }],
    };
    assert.equal(grade(record, [paper]).correct, 0, answer);
  }
});
test("the source key's explicit optional conjunction remains accepted for both required tree parts", () => {
  const books = JSON.parse(
    readFileSync("public/cambridge/v2/library.json", "utf8"),
  );
  const paper: Paper = books
    .find((b: { book: number }) => b.book === 15)
    .passages.find((p: Paper) => p.id === "c15-t4-p1");
  assert.equal(answerWordLimit(paper, 7), 2);
  const variants = acceptedAnswerVariants(paper, 7);
  for (const answer of [
    "leaves bark",
    "bark leaves",
    "leaves and bark",
    "bark and leaves",
  ])
    assert.ok(variants.includes(answer), answer);
  assert.ok(!variants.includes("leaves"));
  assert.ok(!variants.includes("bark"));
});
test("optional alternatives keep their required noun and accept the source hyphenated answer", () => {
  const branches = answerVariants("(its/ huarango / the) branches");
  for (const answer of [
    "branches",
    "its branches",
    "huarango branches",
    "the branches",
  ])
    assert.ok(branches.includes(answer), answer);
  for (const answer of ["its", "huarango", "the"])
    assert.ok(!branches.includes(answer), answer);
  assert.ok(answerVariants("car(-) sharing").includes("car-sharing"));
  assert.ok(answerVariants("car(-) sharing").includes("car sharing"));
});
test("the source notes allow only traffic and crime to exchange places", () => {
  const books = JSON.parse(
    readFileSync("public/cambridge/v2/library.json", "utf8"),
  );
  const paper: Paper = books.find((b: { book: number }) => b.book === 14)
    .passages[0];
  const answers = Object.fromEntries(
    Object.entries(paper.answers).map(([n, answer]) => [
      paper.id + ":" + n,
      answer,
    ]),
  ) as Record<string, string>;
  answers[paper.id + ":4"] = "crime";
  answers[paper.id + ":5"] = "traffic";
  const record = {
    ...attempt(answers),
    tasks: [{ paperId: paper.id, numbers: paper.numbers }],
  };
  assert.equal(grade(record, [paper]).correct, 13);
  answers[paper.id + ":5"] = "crime";
  assert.equal(grade(record, [paper]).correct, 12);
  answers[paper.id + ":4"] = "rules";
  answers[paper.id + ":5"] = "traffic";
  assert.equal(grade(record, [paper]).correct, 12);
});
test("stage thresholds round up actual selected question counts", () => {
  assert.equal(requiredCorrect(1, 6), 6);
  assert.equal(requiredCorrect(1, 13), 11);
  assert.equal(requiredCorrect(2, 7), 6);
  assert.equal(requiredCorrect(2, 13), 10);
  assert.equal(requiredCorrect(3, 14), 8);
  assert.equal(requiredCorrect(3, 4), 3);
});
test("Passage 1 includes every original question; other stages select specified types", () => {
  assert.deepEqual(stageNumbers(p, 1), [1, 2, 3]);
  assert.deepEqual(stageNumbers(p, 2), []);
  assert.deepEqual(stageNumbers(p, 3), [1, 2]);
  const complete = {
    ...p,
    numbers: [1, 2, 3, 4],
    groups: [
      ...p.groups,
      {
        from: 4,
        to: 4,
        type: "other" as const,
        instruction: "",
        anyOrder: false,
      },
    ],
  };
  assert.deepEqual(stageNumbers(complete, 1), [1, 2, 3, 4]);
  assert.deepEqual(stageNumbers(complete, 3), [1, 2]);
});
test("multi-select accepts either order and never awards duplicate selections twice", () => {
  assert.equal(
    grade(
      attempt({
        [p.id + ":1"]: "D",
        [p.id + ":2"]: "B",
        [p.id + ":3"]: "notgiven",
      }),
      [p],
    ).correct,
    3,
  );
  assert.equal(
    grade(attempt({ [p.id + ":1"]: "B", [p.id + ":2"]: "B" }), [p]).correct,
    1,
  );
});
test("unrecognised answer keys remain pending and manual verification is persisted", () => {
  const a = attempt({ [p.id + ":3"]: "yes" }),
    paper = { ...p, answers: { ...p.answers, 3: "" } };
  assert.equal(grade(a, [paper]).pending, 1);
  a.marks[p.id + ":3"] = true;
  assert.equal(grade(a, [paper]).pending, 0);
  assert.equal(grade(a, [paper]).correct, 1);
});
test("optional answer words and spelling alternatives are accepted", () => {
  assert.ok(answerVariants("(stacked) trays").includes("trays"));
  assert.ok(answerVariants("railway(s)").includes("railways"));
  assert.ok(answerVariants("labour / labor").includes("labor"));
});
test("shared spelling endings retain their common prefix and numeric commas are harmless", () => {
  assert.ok(answerVariants("urban centres/centers").includes("urban centers"));
  assert.ok(!answerVariants("urban centres/centers").includes("centers"));
  assert.ok(answerVariants("(the) harbour / harbor").includes("the harbor"));
});
test("the huarango medicine answer requires both parts and accepts either order", () => {
  const variants = answerVariants("leaves (and) bark / bark (and) leaves");
  for (const answer of [
    "leaves bark",
    "bark leaves",
    "leaves and bark",
    "bark and leaves",
  ])
    assert.ok(variants.includes(answer), answer);
  for (const answer of ["leaves", "bark", "leaves leaves"])
    assert.ok(!variants.includes(answer), answer);
});
