import type { Pack } from "./engine";

// Verified against the supplied books' original answer pages. Repair only the
// exact old transcription, preserving intentional local answer overrides.
const corrections: Record<
  string,
  { number: number; old: string; answer: string }
> = {
  "c15-t4-p1": {
    number: 7,
    old: "IN EITHER ORDER (BOTH REQUIRED",
    answer: "leaves (and) bark / bark (and) leaves",
  },
  "c17-t4-p1": { number: 9, old: "I", answer: "mosquitoes" },
  "c19-t4-p2": { number: 16, old: "F", answer: "E" },
};

export function repairKnownSourceAnswers(packs: Pack[]): Pack[] {
  return packs.map((pack) => ({
    ...pack,
    passages: pack.passages.map((paper) => {
      const fix = corrections[paper.id];
      return fix && paper.answers[fix.number] === fix.old
        ? { ...paper, answers: { ...paper.answers, [fix.number]: fix.answer } }
        : paper;
    }),
  }));
}
