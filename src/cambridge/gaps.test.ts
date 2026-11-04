import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { gapNumbers, gapParagraphs } from "./gaps";
import { type Pack } from "./engine";
const packs = JSON.parse(
  readFileSync("public/cambridge/v2/library.json", "utf8"),
) as Pack[];
test("every completion question across all 108 passages has exactly one inline gap", () => {
  for (const p of packs.flatMap((b) => b.passages)) {
    for (const group of p.groups) {
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

test("reviewed gaps stay at their actual subject and table-use positions rather than nearby quantities", () => {
  const papers = packs.flatMap((b) => b.passages);
  const text = (id: string, from: number) => {
    const p = papers.find((p) => p.id === id)!;
    return gapParagraphs(
      p.groups.find((g) => g.from === from)!,
      p.questionText!.find((s) => s.from === from)!,
    )!;
  };
  const collecting = text("c12-t1-p2", 14);
  assert.ok(
    collecting.some((s) =>
      s.includes("{{21}} tends to be mostly a male hobby."),
    ),
  );
  assert.ok(!collecting.some((s) => s.includes("hobby {{21}}")));
  const coconut = text("c13-t3-p1", 1);
  assert.ok(coconut.includes("leaves up to 6 metres long to make brushes"));
  assert.ok(
    coconut.some((s) => s.includes("a source of {{6}} for other plants")),
  );
  const projects = text("c11-t1-p3", 30);
  assert.ok(
    projects.some((s) =>
      s.includes("into orbit far above Earth — to create a {{30}}"),
    ),
  );
  const bilingual = text("c12-t2-p3", 27);
  assert.ok(
    bilingual.some((s) =>
      s.includes(
        "{{27}} of Russian-English bilingual people when asked to select certain objects",
      ),
    ),
  );
  assert.ok(bilingual.some((s) => s.includes("mechanism known as {{28}}")));
  const tourism = text("c13-t1-p1", 1);
  assert.ok(tourism.some((s) => s.includes("varied depending on the {{5}}")));
  assert.ok(
    tourism.some((s) => s.includes("public transport and local {{6}}")),
  );
});
test("source gaps remain at their semantic locations, without consuming stage labels or dates", () => {
  const papers = packs.flatMap((b) => b.passages);
  const rendered = (id: string, from: number) => {
    const p = papers.find((p) => p.id === id)!;
    return gapParagraphs(
      p.groups.find((g) => g.from === from)!,
      p.questionText!.find((s) => s.from === from)!,
    )!;
  };
  const stones = rendered("c18-t2-p1", 1);
  for (const stage of [1, 2, 3]) assert.ok(stones.includes(`Stage ${stage}:`));
  assert.ok(stones.some((s) => s.includes("tools made from {{1}}")));
  assert.ok(
    stones.some((s) => s.includes("builders used {{3}} to make sledges")),
  );
  const obi = rendered("c19-t3-p1", 8);
  assert.ok(obi.some((s) => s.includes("11,700") && !s.includes("{{11}}")));
  assert.ok(obi.some((s) => s.includes("{{11}}") && s.includes("resembled")));
  assert.ok(
    rendered("c17-t2-p2", 24).some((s) => s.includes("loss of {{24}} may")),
  );
  assert.ok(
    rendered("c17-t3-p2", 23).some((s) => s.includes("stays {{23}} even")),
  );
  assert.ok(
    rendered("c14-t2-p3", 35).some((s) => s.includes("not {{35}} enough")),
  );
  assert.ok(
    rendered("c11-t1-p2", 20).some((s) => s.includes("motors drive {{22}}")),
  );
  assert.ok(
    rendered("c16-t4-p2", 18).some((s) => s.includes("read {{21}} words")),
  );
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
