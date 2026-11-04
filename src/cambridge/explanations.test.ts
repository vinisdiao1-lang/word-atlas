import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  validateExplanation,
  explanationAnswerLabel,
  type Explanation,
} from "./explanations";
import type { Pack } from "./engine";
const source = JSON.parse(
  readFileSync("public/cambridge/v2/library.json", "utf8"),
) as Pack[];
const p = source[0].passages[0];
test("either-order explanations show the full accepted choice set rather than a conflicting single key", () => {
  const paper = source
    .flatMap((b) => b.passages)
    .find((p) => p.id === "c19-t1-p2")!;
  assert.equal(explanationAnswerLabel(paper, 20), "B、D（本组答案，顺序不限）");
  assert.equal(explanationAnswerLabel(paper, 21), "B、D（本组答案，顺序不限）");
  assert.equal(explanationAnswerLabel(p, 1), p.answers[1]);
});
const example: Explanation = {
  answer: p.answers[1],
  stem: "Some food plants, including ___, are already grown indoors.",
  evidence: [{ paragraph: 2, quote: p.reading!.paragraphs[1].slice(0, 100) }],
  reasoning: [
    "定位题干中的already和indoors，寻找已有室内种植的例子。",
    "原文第二段先说明室内种植并非新概念，再给出作物例子；答案须从原文提取并符合字数限制。",
  ],
  paraphrases: [],
  traps: ["不要误填未来垂直农场中的作物。"],
  reviewTip: "核对答案拼写及字数。",
};
test("explanation evidence and answer must belong to the actual paper", () => {
  assert.equal(validateExplanation(example, p, 1), example);
  assert.throws(() =>
    validateExplanation({ ...example, answer: "wrong" }, p, 1),
  );
  assert.throws(() =>
    validateExplanation(
      { ...example, evidence: [{ paragraph: 2, quote: "invented evidence" }] },
      p,
      1,
    ),
  );
  assert.throws(() =>
    validateExplanation(
      { ...example, evidence: [{ paragraph: 999, quote: "outside" }] },
      p,
      1,
    ),
  );
  assert.throws(() =>
    validateExplanation(
      { ...example, reasoning: ["only one generic statement"] },
      p,
      1,
    ),
  );
});
