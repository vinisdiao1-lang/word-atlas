import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Pack } from "./engine";
import { repairKnownSourceAnswers } from "./corrections";

test("old imported books receive verified transcription fixes without replacing custom keys", () => {
  const packs = JSON.parse(
    readFileSync("public/cambridge/v2/library.json", "utf8"),
  ) as Pack[];
  const paper = packs
    .flatMap((p) => p.passages)
    .find((p) => p.id === "c19-t4-p2")!;
  paper.answers[16] = "F";
  const repaired = repairKnownSourceAnswers(packs);
  assert.equal(
    repaired.flatMap((p) => p.passages).find((p) => p.id === paper.id)!
      .answers[16],
    "E",
  );
  assert.equal(paper.answers[16], "F");
  paper.answers[16] = "custom";
  assert.equal(
    repairKnownSourceAnswers(packs)
      .flatMap((p) => p.passages)
      .find((p) => p.id === paper.id)!.answers[16],
    "custom",
  );
});
