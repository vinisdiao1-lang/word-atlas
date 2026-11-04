import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Pack, Paper } from "./engine";
import { matchedWordCounts, practiceCandidates } from "./matching";

const source = JSON.parse(
  readFileSync("public/cambridge/v2/library.json", "utf8"),
) as Pack[];
const base = source[0].passages[0];
const paper = (id: string, book: number, text: string, test = 1): Paper => ({
  ...base,
  id,
  book,
  test,
  text: "obsolete OCR includes phantom words",
  reading: { title: "Practice", paragraphs: [text] },
  questionText: [{ from: 1, to: 13, paragraphs: ["Which school?"] }],
  answers: { ...base.answers, 1: "secret" },
});

test("Cambridge coverage counts unique learned headwords and common forms from visible prose and questions", () => {
  const p = paper(
    "rich",
    11,
    "Children studied, studied and taught in an article.",
  );
  const words = [
    "child",
    "study",
    "STUDY",
    "teach",
    "school",
    "art",
    "phantom",
    "secret",
  ];
  const counts = matchedWordCounts([p], words);
  assert.equal(counts.get("rich"), 4);
  assert.equal(matchedWordCounts([p], []).get("rich"), 0);
  assert.equal(
    matchedWordCounts(
      [{ ...p, reading: undefined, text: "A child studies." }],
      ["child", "study"],
    ).get("rich"),
    2,
  );
});

test("matching order, book order and positive-only filtering work independently with stable ties", () => {
  const papers = [
    paper("later", 12, ""),
    paper("earlier", 11, ""),
    paper("zero", 13, ""),
    paper("mock", 19, ""),
  ];
  const counts = new Map([
    ["later", 3],
    ["earlier", 1],
    ["zero", 0],
    ["mock", 99],
  ]);
  const ids = (onlyMatched: boolean, order: "book" | "matched-desc") =>
    practiceCandidates(papers, 1, counts, { onlyMatched, order }).map(
      (p) => p.id,
    );
  assert.deepEqual(ids(false, "matched-desc"), ["later", "earlier", "zero"]);
  assert.deepEqual(ids(false, "book"), ["earlier", "later", "zero"]);
  assert.deepEqual(ids(true, "matched-desc"), ["later", "earlier"]);
  assert.deepEqual(ids(true, "book"), ["earlier", "later"]);
  counts.set("earlier", 3);
  assert.deepEqual(ids(false, "matched-desc"), ["earlier", "later", "zero"]);
  assert.deepEqual(
    practiceCandidates(papers, 1, new Map(), {
      onlyMatched: true,
      order: "matched-desc",
    }),
    [],
  );
  assert.deepEqual(
    practiceCandidates(papers, 2, counts, {
      onlyMatched: false,
      order: "matched-desc",
    }),
    [],
  );
});
