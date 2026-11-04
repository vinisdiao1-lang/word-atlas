import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WordRef } from "../atlas/types";
import { ExamText } from "./Text";

test("learned-word highlights preserve passage text, paragraph labels and evidence anchors", () => {
  const props = {
    article: true,
    paragraphs: [
      "Children studied in school.",
      "A This article describes a child.",
    ],
    paragraphId: (i: number) => `evidence-${i + 1}`,
  };
  const highlightWords = ["child", "study", "school", "art"].map((word) => ({
    id: word,
    word,
    zh: "测试释义",
    ipa: "",
    cefr: 1,
    topic: 0,
    media: 0,
    order: 0,
  })) as WordRef[];
  const plain = renderToStaticMarkup(createElement(ExamText, props));
  const highlighted = renderToStaticMarkup(
    createElement(ExamText, { ...props, highlightWords }),
  );
  assert.deepEqual(
    [...highlighted.matchAll(/<mark[^>]*>(.*?)<\/mark>/g)].map((m) => m[1]),
    ["Children", "studied", "school", "child"],
  );
  assert.equal(
    highlighted.replace(/<[^>]*>/g, ""),
    plain.replace(/<[^>]*>/g, ""),
  );
  assert.ok(highlighted.includes('id="evidence-2"'));
  assert.ok(highlighted.includes('class="exam-text-label">A</b>'));
  assert.ok(!plain.includes("<mark"));
  assert.equal(
    renderToStaticMarkup(
      createElement(ExamText, { ...props, highlightWords: [] }),
    ),
    plain,
  );
});

test("inline gap inputs remain at the original position when highlighting is unused", () => {
  const html = renderToStaticMarkup(
    createElement(ExamText, {
      paragraphs: ["The {{1}} grew near a {{2}}."],
      renderGap: (n: number) =>
        createElement("input", { "aria-label": `Answer ${n}` }),
    }),
  );
  assert.match(html, /The <\/span><span><input aria-label="Answer 1"/);
  assert.match(html, /grew near a <\/span><span><input aria-label="Answer 2"/);
  assert.ok(!html.includes("<mark"));
});
