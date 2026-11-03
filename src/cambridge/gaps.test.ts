import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gapNumbers, gapParagraphs } from "./gaps";
import { stageNumbers, type Pack } from "./engine";
const packs = JSON.parse(
  readFileSync("public/cambridge/v2/library.json", "utf8"),
) as Pack[];
test("every exercised completion question has exactly one inline gap at its original number", () => {
  for (const p of packs.flatMap((b) => b.passages)) {
    const selected = p.book === 19 ? p.numbers : stageNumbers(p, p.passage);
    for (const group of p.groups.filter((g) => selected.includes(g.from))) {
      const section = p.questionText!.find((s) => s.from === group.from)!;
      const text = gapParagraphs(group, section);
      if (!text) continue;
      assert.deepEqual(
        gapNumbers(text).sort((a, b) => a - b),
        Array.from(
          { length: group.to - group.from + 1 },
          (_, i) => group.from + i,
        ),
        `${p.id}:${group.from}`,
      );
    }
  }
});
test("sentence gaps stay inside their sentence, rather than replacing the leading question number", () => {
  const p = packs[0].passages[0],
    group = p.groups[0];
  const text = gapParagraphs(group, p.questionText![0])!;
  assert.ok(
    text.some((t) =>
      t.includes(
        "1 Some food plants, including {{1}} are already grown indoors.",
      ),
    ),
  );
  assert.ok(text.some((t) => t.includes("produce {{3}}.")));
  assert.equal(gapParagraphs(p.groups[1], p.questionText![1]), null);
});
test("summary gaps preserve surrounding prose, option lists and source question data", () => {
  const p = packs[8].passages[2],
    group = p.groups.find((g) => g.from === 31)!;
  const source = p.questionText!.find((g) => g.from === 31)!;
  const original = JSON.stringify(source);
  const text = gapParagraphs(group, source)!;
  assert.ok(
    text.some((t) => t.includes("people have {{31}}to misinformation")),
  );
  assert.ok(text.includes("J different ideas"));
  assert.equal(JSON.stringify(source), original);
});
