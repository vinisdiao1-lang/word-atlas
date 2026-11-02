import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { parseLibrary } from "./library";
import { stageNumbers, validatePack, type Pack } from "./engine";

const source = JSON.parse(
  readFileSync("public/cambridge/v1/library.json", "utf8"),
) as Pack[];
const root = "/word-atlas/cambridge/v1/pages/";

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
