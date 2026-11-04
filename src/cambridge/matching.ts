import { normalize } from "../lib/text";
import { readingWordForms, readingWordPattern } from "../reading/engine";
import { stageNumbers, type Paper } from "./engine";

export type PracticeOrder = "matched-desc" | "book";
export interface PracticePreferences {
  onlyMatched: boolean;
  order: PracticeOrder;
  highlightLearned: boolean;
}
export const defaultPracticePreferences: PracticePreferences = {
  onlyMatched: false,
  order: "matched-desc",
  highlightLearned: false,
};
export const practicePreferencesKey =
  "word-atlas:cambridge-practice-preferences";

export function readPracticePreferences(): PracticePreferences {
  try {
    const value = JSON.parse(
      localStorage.getItem(practicePreferencesKey) ?? "null",
    );
    return {
      onlyMatched: value?.onlyMatched === true,
      order: value?.order === "book" ? "book" : "matched-desc",
      highlightLearned: value?.highlightLearned === true,
    };
  } catch {
    return { ...defaultPracticePreferences };
  }
}

/** Count distinct learned headwords, including conservative inflected forms. */
export function matchedWordCounts(papers: Paper[], learnedWords: string[]) {
  const forms = new Map<string, Set<string>>();
  const phrases: { word: string; pattern: RegExp }[] = [];
  for (const word of new Set(learnedWords.map(normalize).filter(Boolean))) {
    if (!/^[a-z]+$/.test(word)) {
      phrases.push({ word, pattern: readingWordPattern(word) });
      continue;
    }
    for (const form of readingWordForms(word)) {
      if (!forms.has(form)) forms.set(form, new Set());
      forms.get(form)!.add(word);
    }
  }
  return new Map(
    papers.map((paper) => {
      const text = normalize(
        paper.reading
          ? [
              paper.reading.title,
              ...paper.reading.paragraphs,
              ...(paper.questionText ?? []).flatMap(
                (section) => section.paragraphs,
              ),
            ].join("\n")
          : paper.text,
      );
      const matched = new Set<string>();
      for (const token of text.match(/[a-z]+/g) ?? []) {
        for (const word of forms.get(token) ?? []) matched.add(word);
      }
      for (const { word, pattern } of phrases) {
        pattern.lastIndex = 0;
        if (pattern.test(text)) matched.add(word);
      }
      return [paper.id, matched.size] as const;
    }),
  );
}

export function practiceCandidates(
  papers: Paper[],
  stage: number,
  coverage: Map<string, number>,
  preferences: PracticePreferences,
) {
  return papers
    .filter(
      (paper) =>
        paper.book < 19 &&
        paper.passage === stage &&
        stageNumbers(paper, stage).length > 0 &&
        (!preferences.onlyMatched || (coverage.get(paper.id) ?? 0) > 0),
    )
    .sort(
      (a, b) =>
        (preferences.order === "matched-desc"
          ? (coverage.get(b.id) ?? 0) - (coverage.get(a.id) ?? 0)
          : 0) ||
        a.book - b.book ||
        a.test - b.test ||
        a.id.localeCompare(b.id),
    );
}
