import { useEffect, useState } from "react";
import type { Paper } from "./engine";
import { qid } from "./engine";
import {
  loadExplanationBook,
  validateExplanation,
  explanationAnswerLabel,
  type Explanation,
} from "./explanations";

export function DetailedExplanation({
  paper,
  number,
  userAnswer,
  onLocate,
}: {
  paper: Paper;
  number: number;
  userAnswer: string;
  onLocate: (paragraph: number) => void;
}) {
  const [content, setContent] = useState<Explanation | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setContent(null);
    setError("");
    loadExplanationBook(paper.book)
      .then((data) => {
        const explanation = validateExplanation(
          data.items[qid(paper.id, number)],
          paper,
          number,
        );
        if (live) setContent(explanation);
      })
      .catch((e: unknown) => {
        if (live)
          setError(e instanceof Error ? e.message : "详细解析加载失败。");
      });
    return () => {
      live = false;
    };
  }, [paper, number, retry]);
  return (
    <details className="exam-explanation" open>
      <summary>第 {number} 题 · 详细解析</summary>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button
            className="btn btn-ghost"
            onClick={() => setRetry((n) => n + 1)}
          >
            重试
          </button>
        </p>
      ) : !content ? (
        <p role="status">正在加载本题解析…</p>
      ) : (
        <>
          <p className="exam-explanation-stem">
            {content.stem.replace(/\{\{(\d+)\}\}/g, "[$1] ____")}
          </p>
          <p>
            你的答案：<b>{userAnswer.trim() || "未作答"}</b> · 正确答案：
            <b>{explanationAnswerLabel(paper, number)}</b>
          </p>
          <h4>原文定位</h4>
          {content.evidence.map((e, i) => (
            <div className="exam-evidence" key={i}>
              <button className="link" onClick={() => onLocate(e.paragraph)}>
                定位到原文第 {e.paragraph} 段 ↗
              </button>
              <blockquote>{e.quote}</blockquote>
            </div>
          ))}
          <h4>解题过程</h4>
          <ol>
            {content.reasoning.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
          {!!content.paraphrases.length && (
            <>
              <h4>题干与原文对照</h4>
              <dl>
                {content.paraphrases.map((p, i) => (
                  <div key={i}>
                    <dt>题干：{p.question}</dt>
                    <dd>
                      <b>原文：{p.passage}</b>
                      <br />
                      {p.explanation}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {!!content.options?.length && (
            <>
              <h4>选项逐项分析</h4>
              <ul>
                {content.options.map((o, i) => (
                  <li key={i}>
                    <b>
                      {o.label} · {o.correct ? "成立" : "不成立"}
                      {o.label.toUpperCase() === userAnswer.trim().toUpperCase()
                        ? " · 你的选择"
                        : ""}
                    </b>
                    ：{o.reason}
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4>本题易错点</h4>
          <ul>
            {content.traps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
          <p className="exam-review-tip">
            <b>复盘提醒：</b>
            {content.reviewTip}
          </p>
        </>
      )}
    </details>
  );
}
