import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { parseLibrary } from "./library";
import { practiceCandidates, defaultPracticePreferences } from "./matching";
import { validateExplanation } from "./explanations";
import {
  stageNumbers,
  validatePack,
  type Pack,
  type QuestionText,
} from "./engine";

const source = JSON.parse(
  readFileSync("public/cambridge/v2/library.json", "utf8"),
) as Pack[];
const root = "/word-atlas/cambridge/v1/pages/";

test("all 32 training Passage 1 papers contain the complete questions 1–13", () => {
  const papers = source
    .flatMap((book) => book.passages)
    .filter((p) => p.book < 19 && p.passage === 1);
  assert.equal(papers.length, 32);
  for (const p of papers)
    assert.deepEqual(
      stageNumbers(p, 1),
      Array.from({ length: 13 }, (_, i) => i + 1),
      p.id,
    );
});

test("all three training categories expose 32 complete papers with answers and explanations for all 1280 questions", () => {
  const papers = source.flatMap((book) => book.passages);
  const explanations = new Map(
    source
      .filter((b) => b.book < 19)
      .map((b) => [
        b.book,
        JSON.parse(
          readFileSync(`public/cambridge/explanations/c${b.book}.json`, "utf8"),
        ).items,
      ]),
  );
  let total = 0;
  for (const stage of [1, 2, 3]) {
    const selected = practiceCandidates(
      papers,
      stage,
      new Map(),
      defaultPracticePreferences,
    );
    assert.equal(selected.length, 32);
    for (const paper of selected) {
      const start = stage === 1 ? 1 : stage === 2 ? 14 : 27;
      const count = stage === 3 ? 14 : 13;
      assert.deepEqual(
        stageNumbers(paper, stage),
        Array.from({ length: count }, (_, i) => start + i),
        paper.id,
      );
      for (const number of stageNumbers(paper, stage)) {
        assert.ok(paper.answers[number]?.trim(), `${paper.id}:${number}`);
        validateExplanation(
          explanations.get(paper.book)[`${paper.id}:${number}`],
          paper,
          number,
        );
        total++;
      }
    }
  }
  assert.equal(total, 1280);
});

test("person and theory matching options retain every letter as full-Passage practice exposes them", () => {
  for (const paper of source
    .filter((book) => book.book < 19)
    .flatMap((book) => book.passages)) {
    for (const section of paper.questionText ?? []) {
      if (paper.groups.find((g) => g.from === section.from)?.type !== "other")
        continue;
      const range = section.paragraphs
        .slice(0, 4)
        .join(" ")
        .match(/\bA\s*[-–]\s*([B-K])\b/);
      const start = section.paragraphs.findIndex((s) => /^A\s+/.test(s));
      if (!range || start < 0) continue;
      const labels = section.paragraphs
        .slice(start)
        .flatMap((s) => s.match(/^([A-K])\s+/)?.[1] ?? []);
      assert.deepEqual(
        labels,
        Array.from({ length: range[1].charCodeAt(0) - 64 }, (_, i) =>
          String.fromCharCode(65 + i),
        ),
        `${paper.id}:${section.from}`,
      );
    }
  }
});

test("deployed library covers all nine books, 36 full reading tests and 1,440 questions", () => {
  const packs = parseLibrary(source, root);
  assert.deepEqual(
    packs.map((p) => p.book),
    [11, 12, 13, 14, 15, 16, 17, 18, 19],
  );
  const papers = packs.flatMap((p) => p.passages);
  assert.equal(papers.length, 108);
  assert.equal(
    papers.reduce((n, p) => n + p.numbers.length, 0),
    1440,
  );
  for (const stage of [1, 2, 3])
    assert.ok(
      papers.some(
        (p) =>
          p.book < 19 && p.passage === stage && stageNumbers(p, stage).length,
      ),
    );
  for (const p of papers)
    for (const page of [...p.pages, p.answerPage]) {
      const filename = `public/cambridge/v1/pages/${page.image.slice(root.length)}`;
      assert.ok(existsSync(filename), filename);
      assert.equal(
        readFileSync(filename).subarray(0, 2).toString("hex"),
        "ffd8",
      );
    }
});

test("published scan paths stay inside their book; local imports still reject remote URLs", () => {
  const data = structuredClone(source);
  data[0].passages[0].pages[0].image = "https://example.com/scan.jpg";
  assert.throws(() => parseLibrary(data, root));
  data[0].passages[0].pages[0].image = "../c11-p1.jpg";
  assert.throws(() => parseLibrary(data, root));
  data[0].passages[0].pages[0].image = "c12-p1.jpg";
  assert.throws(() => parseLibrary(data, root));
  const pack = parseLibrary(source, root)[0];
  assert.throws(() => validatePack(pack));
});

test("all passages have substantial selectable prose and the exercised questions have complete text", () => {
  for (const p of source.flatMap((book) => book.passages)) {
    assert.ok(
      p.reading && p.reading.paragraphs.join(" ").split(/\s+/).length >= 400,
      p.id,
    );
    assert.ok(p.questionText?.length === p.groups.length, p.id);
    const selected = p.book === 19 ? p.numbers : stageNumbers(p, p.passage);
    for (const group of p.groups.filter((g) => selected.includes(g.from))) {
      const text: QuestionText = p.questionText!.find(
        (s) => s.from === group.from,
      )!;
      assert.ok(
        text.paragraphs.join(" ").length > 100,
        `${p.id}:${group.from}`,
      );
      if (
        ["judgment", "heading", "paragraph-match", "choice"].includes(
          group.type,
        ) &&
        !group.anyOrder
      )
        assert.deepEqual(
          text.items?.map((i) => i.number),
          Array.from(
            { length: group.to - group.from + 1 },
            (_, i) => group.from + i,
          ),
          `${p.id}:${group.from}`,
        );
    }
  }
});

test("choice questions retain every option label, including letters missed in scanned books", () => {
  for (const p of source.flatMap((book) => book.passages)) {
    for (const group of p.groups.filter((g) => g.type === "choice")) {
      const text = p.questionText!.find((s) => s.from === group.from)!;
      const blocks = group.anyOrder
        ? [text.paragraphs]
        : text.items!.map((i) => i.paragraphs);
      for (const block of blocks)
        assert.deepEqual(
          block.filter((s) => /^[A-J] /.test(s)).map((s) => s[0]),
          (group.anyOrder ? "ABCDE" : "ABCD").split(""),
          `${p.id}:${group.from}`,
        );
    }
  }
});

test("heading options start at i and follow an uninterrupted sequence", () => {
  const roman = [
    "i",
    "ii",
    "iii",
    "iv",
    "v",
    "vi",
    "vii",
    "viii",
    "ix",
    "x",
    "xi",
    "xii",
  ];
  for (const p of source.flatMap((book) => book.passages))
    for (const group of p.groups.filter((g) => g.type === "heading")) {
      const text = p.questionText!.find((s) => s.from === group.from)!;
      const labels = text.intro!.flatMap(
        (s) => s.match(/^([ivx]+) /i)?.[1]?.toLowerCase() ?? [],
      );
      assert.deepEqual(
        labels,
        roman.slice(0, labels.length),
        `${p.id}:${group.from}`,
      );
      assert.ok(labels.length >= group.to - group.from + 1, p.id);
    }
});

test("summary word lists retain all lettered options", () => {
  for (const p of source.flatMap((book) => book.passages))
    for (const group of p.groups.filter((g) => g.type === "summary")) {
      const section = p.questionText!.find((s) => s.from === group.from)!;
      const range = section.paragraphs
        .join(" ")
        .match(/list of (?:words|phrases),?\s*A[–-]([A-K])/i);
      if (!range) continue;
      const start = section.paragraphs.findIndex(
        (s) => /^A /.test(s) && s.length < 100,
      );
      assert.ok(start >= 0, p.id);
      assert.deepEqual(
        section.paragraphs.slice(start).map((s) => s.match(/^([A-K]) /)?.[1]),
        Array.from({ length: range[1].charCodeAt(0) - 64 }, (_, i) =>
          String.fromCharCode(65 + i),
        ),
        p.id,
      );
    }
});

test("source-checked corrections retain the missing section, question context and official key", () => {
  const papers = source.flatMap((b) => b.passages);
  assert.ok(
    papers
      .find((p) => p.id === "c13-t3-p2")!
      .reading!.paragraphs[5].startsWith("F In a study published"),
  );
  assert.ok(
    papers
      .find((p) => p.id === "c13-t1-p1")!
      .questionText!.find((g) => g.from === 8)!
      .items![0].paragraphs[0].includes("ready-made itineraries"),
  );
  assert.equal(papers.find((p) => p.id === "c19-t4-p2")!.answers[16], "E");
});
