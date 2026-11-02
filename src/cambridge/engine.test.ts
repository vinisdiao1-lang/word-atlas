import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requiredCorrect,
  stageNumbers,
  grade,
  answerVariants,
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
test("stage thresholds round up actual selected question counts", () => {
  assert.equal(requiredCorrect(1, 6), 6);
  assert.equal(requiredCorrect(1, 13), 11);
  assert.equal(requiredCorrect(2, 7), 6);
  assert.equal(requiredCorrect(2, 13), 10);
  assert.equal(requiredCorrect(3, 14), 8);
  assert.equal(requiredCorrect(3, 4), 3);
});
test("only specified question types enter each stage", () => {
  assert.deepEqual(stageNumbers(p, 1), [1, 2, 3]);
  assert.deepEqual(stageNumbers(p, 2), []);
  assert.deepEqual(stageNumbers(p, 3), [1, 2]);
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
