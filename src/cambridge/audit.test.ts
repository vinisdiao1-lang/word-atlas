import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { unorderedAnswerSets, type Pack } from "./engine";
const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const source: Pack[] = read("public/cambridge/v2/library.json");
const keys = read("docs/audits/cambridge-answer-key-review.json");

test("all 1440 answer values and unordered sets match the visually reviewed source keys", () => {
  assert.equal(keys.tests.length, 36);
  let total = 0;
  for (const entry of keys.tests) {
    const papers = source
      .find((b) => b.book === entry.book)!
      .passages.filter((p) => p.test === entry.test);
    assert.deepEqual(
      Object.fromEntries(
        papers.flatMap((p) =>
          p.numbers.map((n) => [`${p.id}:${n}`, p.answers[n]]),
        ),
      ),
      entry.answers,
    );
    assert.deepEqual(
      papers.flatMap(unorderedAnswerSets),
      entry.unorderedQuestionSets,
    );
    const path = `public/cambridge/v1/pages/${entry.sourceImage}`;
    assert.ok(existsSync(path));
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      entry.sourceImageSha256,
    );
    total += Object.keys(entry.answers).length;
  }
  assert.equal(total, 1440);
});

test("semantic review records cover each question exactly once across the nine books", () => {
  const ids = ["11-13", "14-16", "17-19"].flatMap((range) => {
    const review = read(`docs/audits/cambridge-${range}-review.json`);
    assert.ok(["complete", "completed"].includes(review.status));
    assert.equal(review.reviewedIds.length, 480);
    return review.reviewedIds;
  });
  const expected = source
    .flatMap((b) =>
      b.passages.flatMap((p) => p.numbers.map((n) => `${p.id}:${n}`)),
    )
    .sort();
  assert.deepEqual(ids.sort(), expected);
  assert.equal(new Set(ids).size, 1440);
});

test("source repairs preserve the actual sentence rather than mixing columns", () => {
  const papers = source.flatMap((b) => b.passages);
  const reading = (id: string) =>
    papers.find((p) => p.id === id)!.reading!.paragraphs;
  const streaming = reading("c18-t3-p3");
  assert.ok(streaming[6].includes("representation of low socioeconomic class"));
  assert.ok(!streaming[6].includes("social tools"));
  assert.ok(
    streaming[9].includes(
      "language tools and different social tools from teachers",
    ),
  );
  const genius = reading("c19-t2-p3");
  assert.ok(
    genius[6].includes("Peak: Secrets from the New Science of Expertise"),
  );
  assert.ok(
    genius[8].includes(
      "high performing learning approach. She is working on this",
    ),
  );
  assert.ok(
    genius[5].endsWith("those approaches at home as well as at school."),
  );
  assert.ok(
    reading("c13-t1-p1")[0].includes(
      "A key feature of the campaign was the website www.newzealand.com",
    ),
  );
});

test("second semantic review covers every question once with explicit inference notes", () => {
  const ids = [
    ["11-13", 480],
    ["14-16", 480],
    ["17-18", 320],
    ["19", 160],
  ].flatMap(([range, count]) => {
    const review = read(`docs/audits/round2-${range}-review.json`);
    assert.ok(
      ["complete", "completed", "completed_with_caveat"].includes(
        review.status,
      ),
    );
    assert.equal(review.reviewedIds.length, count);
    return review.reviewedIds;
  });
  const expected = source
    .flatMap((b) =>
      b.passages.flatMap((p) => p.numbers.map((n) => `${p.id}:${n}`)),
    )
    .sort();
  assert.deepEqual(ids.sort(), expected);
  assert.equal(new Set(ids).size, 1440);
  for (const [book, id] of [
    [13, "c13-t3-p1:12"],
    [17, "c17-t3-p1:7"],
    [19, "c19-t3-p3:35"],
  ]) {
    const explanation = read(`public/cambridge/explanations/c${book}.json`)
      .items[id];
    assert.ok(
      typeof explanation.verificationNote === "string" &&
        explanation.verificationNote.length > 40,
    );
  }
});

test("third semantic review covers all questions and preserves reviewed source typography", () => {
  const ids = ["11-13", "14-16", "17-19"].flatMap((range) => {
    const review = read(`docs/audits/round3-${range}-review.json`);
    assert.ok(["complete", "completed"].includes(review.status));
    assert.equal(review.reviewedIds.length, 480);
    return review.reviewedIds;
  });
  const expected = source
    .flatMap((b) =>
      b.passages.flatMap((p) => p.numbers.map((n) => `${p.id}:${n}`)),
    )
    .sort();
  assert.deepEqual(ids.sort(), expected);
  assert.equal(new Set(ids).size, 1440);
  const paper = source
    .find((b) => b.book === 13)!
    .passages.find((p) => p.id === "c13-t2-p3")!;
  assert.ok(paper.reading!.paragraphs[6].includes("advanced 3D graphics"));
  assert.ok(
    paper
      .questionText![0].items!.find((q) => q.number === 31)!
      .paragraphs.some((s) => s.includes("colourful 3D graphics")),
  );
  assert.ok(!JSON.stringify(paper.questionText).includes("30 graphics"));
});
