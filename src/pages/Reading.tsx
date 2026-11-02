import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Clipboard,
  FileUp,
  Highlighter,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { WordRef } from "../atlas/types";
import { useAtlas } from "../atlas/context";
import { openWord } from "../lib/router";
import {
  isReadingCorrect,
  parseReadingImport,
  readingPrompt,
  readingSpans,
  readingWordCount,
  recommendReadings,
} from "../reading/engine";
import { READING_PASSAGES } from "../reading/passages";
import type {
  ReadingPassage,
  ReadingProgress,
  ReadingQuestion,
  ReadingSession,
} from "../reading/types";
import { store, useStore } from "../store/store";
import { toast } from "../ui/Toast";
import "../styles/reading.css";

const LETTERS = ["A", "B", "C", "D"];
const LEVELS = ["B1", "B2", "C1"] as const;
const updateReading = (fn: (reading: ReadingProgress) => ReadingProgress) =>
  store.progress((p) => ({ ...p, reading: fn(p.reading) }));

export function Reading() {
  const atlas = useAtlas();
  const progress = useStore((s) => s.progress);
  const startLevel = useStore((s) => s.settings.startLevel);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | ReadingPassage["level"]>("all");
  const [promptLevel, setPromptLevel] = useState<ReadingPassage["level"]>(
    startLevel >= 4 ? "C1" : startLevel === 3 ? "B2" : "B1",
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [fallbackPrompt, setFallbackPrompt] = useState("");
  const [rawImport, setRawImport] = useState("");
  const [importError, setImportError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const learned = useMemo(
    () => atlas.words.filter((w) => !!progress.cards[w.id]),
    [atlas, progress.cards],
  );
  const promptWords = useMemo(() => {
    const mistakes = new Set(progress.mistakes);
    return [...learned]
      .sort(
        (a, b) =>
          Number(mistakes.has(b.id)) - Number(mistakes.has(a.id)) ||
          (progress.cards[b.id].last ?? progress.cards[b.id].seen) -
            (progress.cards[a.id].last ?? progress.cards[a.id].seen),
      )
      .slice(0, 40);
  }, [learned, progress.cards, progress.mistakes]);
  const recommendations = useMemo(
    () =>
      recommendReadings(
        [...progress.reading.custom, ...READING_PASSAGES],
        learned,
        new Set(progress.mistakes),
        new Set(progress.reading.history.map((h) => h.passageId)),
      ),
    [
      learned,
      progress.mistakes,
      progress.reading.custom,
      progress.reading.history,
    ],
  );
  const chosen = recommendations.find(({ passage }) => passage.id === selected);
  const relevant = recommendations.filter((r) => r.matches.length > 0).length;
  const unfinished = recommendations.find((r) => {
    const session = progress.reading.sessions[r.passage.id];
    return (
      session &&
      !session.submittedAt &&
      Object.values(session.answers).some((a) => a.trim())
    );
  });
  const begin = (passage: ReadingPassage) => {
    updateReading((r) =>
      r.sessions[passage.id]
        ? r
        : {
            ...r,
            sessions: {
              ...r.sessions,
              [passage.id]: { answers: {}, startedAt: Date.now() },
            },
          },
    );
    setSelected(passage.id);
    window.scrollTo({ top: 0 });
  };
  const copyPrompt = async () => {
    const value = readingPrompt(promptWords, promptLevel);
    try {
      await navigator.clipboard.writeText(value);
      toast(
        `已复制含 ${promptWords.length} 个已学词的提示词，粘贴给 AI 即可出题。`,
        "ok",
      );
    } catch {
      setFallbackPrompt(value);
      toast("请在下方文本框中全选并复制提示词。", "warn");
    }
  };
  const importText = (raw: string) => {
    try {
      const passage = parseReadingImport(raw);
      const existing = progress.reading.custom.some((p) => p.id === passage.id);
      if (!existing && progress.reading.custom.length >= 10)
        throw new Error(
          "已保存 10 篇导入文章，请先移除一篇再导入。学习备份会包含这些文章。",
        );
      updateReading((r) => ({
        ...r,
        custom: r.custom.some((p) => p.id === passage.id)
          ? r.custom
          : [...r.custom, passage],
        sessions: {
          ...r.sessions,
          [passage.id]: r.sessions[passage.id] ?? {
            answers: {},
            startedAt: Date.now(),
          },
        },
      }));
      setRawImport("");
      setImportError("");
      setSelected(passage.id);
      window.scrollTo({ top: 0 });
      toast(
        existing ? "文章已在你的书架，已打开。" : "文章已导入，可以开始阅读。",
        "ok",
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "导入失败，请检查文章格式。",
      );
    }
  };
  const removeCustom = (passage: ReadingPassage) => {
    if (
      !confirm(
        `移除《${passage.title}》及其未提交答案？已提交的成绩记录会保留。`,
      )
    )
      return;
    updateReading((r) => {
      const sessions = { ...r.sessions };
      delete sessions[passage.id];
      return {
        ...r,
        custom: r.custom.filter((p) => p.id !== passage.id),
        sessions,
      };
    });
  };

  if (chosen && progress.reading.sessions[chosen.passage.id])
    return (
      <ReadingDesk
        key={`${chosen.passage.id}-${progress.reading.sessions[chosen.passage.id].startedAt}`}
        passage={chosen.passage}
        matches={chosen.matches}
        session={progress.reading.sessions[chosen.passage.id]}
        onBack={() => {
          setSelected(null);
          window.scrollTo({ top: 0 });
        }}
      />
    );

  return (
    <div className="page reading">
      <header className="page-head reading-intro">
        <p className="eyebrow">READING ROOM · 阅读练习</p>
        <h1 className="display">
          让背过的词，
          <br />
          在文章里重逢。
        </h1>
        <p className="lede">
          根据这台设备的已学词推荐短文，读完做题，再回到原文找依据。
        </p>
        <div className="reading-statline">
          <span>
            已学 <b>{learned.length.toLocaleString()}</b> 词
          </span>
          <span>
            匹配 <b>{relevant}</b> 篇
          </span>
          <span>
            已完成 <b>{progress.reading.history.length}</b> 次
          </span>
        </div>
      </header>

      {!learned.length ? (
        <div className="reading-notice">
          <BookOpen size={22} />
          <div>
            <b>先体验一篇，或先去背几个词。</b>
            <p>
              这台设备还没有已学记录。完成单词测验后，文章会按覆盖的已学词数量自动排序。其他设备的记录可在“我的”中导入。
            </p>
            <a href="#/">
              去今日学习 <ArrowRight size={15} />
            </a>
          </div>
        </div>
      ) : !relevant ? (
        <div className="reading-notice">
          <BookOpen size={22} />
          <div>
            <b>这批已学词暂未出现在内置文章里。</b>
            <p>
              你仍可练习以下短文，也可以用下方的已学词提示词生成更贴合的新文章。
            </p>
          </div>
        </div>
      ) : (
        <p className="reading-caption">
          优先推荐覆盖已学词更多的文章；覆盖量相同时，优先照顾错词和未读文章。已学不等于已熟练。
        </p>
      )}

      {unfinished && (
        <button
          className="reading-resume"
          onClick={() => begin(unfinished.passage)}
        >
          <span>
            <small>上次还没读完</small>
            <b>{unfinished.passage.title}</b>
          </span>
          <span>
            继续作答 <ChevronRight size={17} />
          </span>
        </button>
      )}

      <section aria-label="阅读文章">
        <div className="reading-shelf-head">
          <h2>你的阅读书架</h2>
          <div className="segmented" aria-label="文章难度">
            {(["all", ...LEVELS] as const).map((l) => (
              <button
                key={l}
                onClick={() => setFilter(l)}
                aria-pressed={filter === l}
                className={filter === l ? "is-on" : ""}
              >
                {l === "all" ? "全部" : l}
              </button>
            ))}
          </div>
        </div>
        <div className="reading-shelf">
          {recommendations
            .filter((r) => filter === "all" || r.passage.level === filter)
            .map(({ passage, matches, completed }, index) => {
              const session = progress.reading.sessions[passage.id];
              const result = progress.reading.history
                .filter((h) => h.passageId === passage.id)
                .at(-1);
              const custom = passage.id.startsWith("custom-");
              return (
                <article className="reading-book" key={passage.id}>
                  <div className="reading-book-meta">
                    <span className={`chip chip-level lv-${passage.level}`}>
                      {passage.level}
                    </span>
                    <span>{passage.topic}</span>
                    <span className="reading-edition">
                      {custom
                        ? "你的新文章"
                        : `VOL. ${String(READING_PASSAGES.findIndex((p) => p.id === passage.id) + 1).padStart(2, "0")}`}
                    </span>
                  </div>
                  <h3>{passage.title}</h3>
                  <p className="reading-book-preview" lang="en">
                    {passage.paragraphs[0]}
                  </p>
                  <div className="reading-book-facts">
                    <span>
                      {readingWordCount(passage)} 词 ·{" "}
                      {passage.questions.length} 题
                    </span>
                    <b>
                      {matches.length
                        ? `重逢 ${matches.length} 个已学词`
                        : "体验阅读"}
                    </b>
                  </div>
                  <div className="reading-word-preview">
                    {matches.slice(0, 5).map((w) => (
                      <span key={w.id}>{w.word}</span>
                    ))}
                    {matches.length > 5 && <span>+{matches.length - 5}</span>}
                    {!matches.length && (
                      <span>暂无已学词匹配，也可以直接练习</span>
                    )}
                  </div>
                  <div className="reading-book-footer">
                    <button
                      className={`btn ${index === 0 && matches.length ? "btn-primary" : "btn-outline"}`}
                      onClick={() => begin(passage)}
                    >
                      {session?.submittedAt
                        ? "查看解析"
                        : session
                          ? "继续阅读"
                          : "开始阅读"}
                      <ArrowRight size={17} />
                    </button>
                    {result && (
                      <small>
                        {completed ? "上次" : ""} {result.score}/{result.total}
                      </small>
                    )}
                    {custom && (
                      <button
                        className="icon-btn"
                        onClick={() => removeCustom(passage)}
                        aria-label={`移除 ${passage.title}`}
                        title="移除导入文章"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
      </section>

      <section className="panel reading-tools">
        <button
          className="reading-tools-toggle"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen(!toolsOpen)}
        >
          <span>
            <b>用自己的已学词，准备一篇新文章</b>
            <small>复制提示词给 AI → 导入返回的文章 → 在这里做题</small>
          </span>
          <ChevronRight size={20} className={toolsOpen ? "is-open" : ""} />
        </button>
        {toolsOpen && (
          <div className="reading-tools-body">
            <p className="muted">
              提示词包含最多 40
              个已学词，优先选择错词和最近学过的词。复制后可粘贴到你使用的免费
              AI 对话中；文章不会自动发送到外部服务。
            </p>
            <div className="reading-tool-row">
              <div className="segmented" aria-label="新文章难度">
                {LEVELS.map((l) => (
                  <button
                    key={l}
                    aria-pressed={promptLevel === l}
                    className={promptLevel === l ? "is-on" : ""}
                    onClick={() => setPromptLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <button
                className="btn btn-primary"
                disabled={!promptWords.length}
                onClick={() => void copyPrompt()}
              >
                <Clipboard size={17} />
                复制已学词提示词
              </button>
            </div>
            {!promptWords.length && (
              <p className="muted">
                完成单词测验，或在“我的”中导入学习备份后，即可复制已学词。
              </p>
            )}
            {fallbackPrompt && (
              <label className="reading-text-label">
                出题提示词
                <textarea
                  rows={8}
                  readOnly
                  value={fallbackPrompt}
                  onFocus={(e) => e.currentTarget.select()}
                />
              </label>
            )}
            <label className="reading-text-label" htmlFor="reading-import">
              粘贴 AI 返回的完整 JSON
              <textarea
                id="reading-import"
                rows={6}
                maxLength={60000}
                value={rawImport}
                onChange={(e) => {
                  setRawImport(e.target.value);
                  setImportError("");
                }}
                placeholder={
                  '{"title": "...", "topic": "...", "level": "B1", "paragraphs": [...], "questions": [...]}'
                }
                spellCheck={false}
              />
            </label>
            <div className="reading-tool-row">
              <button
                className="btn btn-primary"
                disabled={!rawImport.trim()}
                onClick={() => importText(rawImport)}
              >
                <BookOpen size={17} />
                导入并开始阅读
              </button>
              <button
                className="btn btn-outline"
                onClick={() => file.current?.click()}
              >
                <FileUp size={17} />
                选择 JSON 文件
              </button>
              <input
                ref={file}
                hidden
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const selectedFile = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (!selectedFile) return;
                  if (selectedFile.size > 60000) {
                    setImportError("文章文件过大，请控制在 60 KB 以内。");
                    return;
                  }
                  try {
                    importText(await selectedFile.text());
                  } catch {
                    setImportError("文件读取失败，请重试或粘贴文章内容。");
                  }
                }}
              />
            </div>
            {importError && (
              <p className="reading-error" role="alert">
                {importError}
              </p>
            )}
            <p className="muted">
              导入会检查格式及原文依据的位置；请同时核对 AI
              的题意和答案。文章、答案及成绩随学习备份一起保存。
            </p>
          </div>
        )}
      </section>
      {progress.reading.history.length > 0 && (
        <section className="panel reading-history">
          <h2>最近的阅读</h2>
          <ul>
            {[...progress.reading.history]
              .reverse()
              .slice(0, 5)
              .map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  <span>
                    {h.title}
                    <small>{new Date(h.at).toLocaleDateString("zh-CN")}</small>
                  </span>
                  <b>
                    {h.score} / {h.total}
                  </b>
                </li>
              ))}
          </ul>
        </section>
      )}
      <p className="reading-disclaimer">
        原创短篇练习，非官方雅思真题；成绩不换算为雅思分数。难度标签为练习分级。
      </p>
    </div>
  );
}

function ReadingDesk({
  passage,
  matches,
  session,
  onBack,
}: {
  passage: ReadingPassage;
  matches: WordRef[];
  session: ReadingSession;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<"passage" | "questions">(() =>
    session.submittedAt !== undefined ||
    Object.values(session.answers).some((a) => a.trim())
      ? "questions"
      : "passage",
  );
  const [highlight, setHighlight] = useState(false);
  const [located, setLocated] = useState<number | null>(null);
  const result = useRef<HTMLDivElement>(null);
  const saveError = useStore((s) => s.saveError);
  const submitted = session.submittedAt !== undefined;
  const answered = passage.questions.filter((q) =>
    session.answers[q.id]?.trim(),
  ).length;
  const score = passage.questions.filter((q) =>
    isReadingCorrect(q, session.answers[q.id]),
  ).length;
  useEffect(() => {
    if (submitted && tab === "questions") {
      result.current?.focus({ preventScroll: true });
      result.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [submitted, tab]);
  const switchTab = (next: "passage" | "questions") => {
    setLocated(null);
    setTab(next);
    window.scrollTo({ top: 0 });
  };
  const setAnswer = (id: string, value: string) =>
    updateReading((r) => {
      const current = r.sessions[passage.id];
      if (!current || current.submittedAt !== undefined) return r;
      return {
        ...r,
        sessions: {
          ...r.sessions,
          [passage.id]: {
            ...current,
            answers: { ...current.answers, [id]: value },
          },
        },
      };
    });
  const submit = () =>
    updateReading((r) => {
      const current = r.sessions[passage.id];
      if (
        !current ||
        current.submittedAt !== undefined ||
        passage.questions.some((q) => !current.answers[q.id]?.trim())
      )
        return r;
      const now = Date.now();
      const correct = passage.questions.filter((q) =>
        isReadingCorrect(q, current.answers[q.id]),
      ).length;
      return {
        ...r,
        sessions: {
          ...r.sessions,
          [passage.id]: { ...current, submittedAt: now },
        },
        history: [
          ...r.history,
          {
            passageId: passage.id,
            title: passage.title,
            at: now,
            score: correct,
            total: passage.questions.length,
          },
        ].slice(-100),
      };
    });
  const restart = () => {
    updateReading((r) => ({
      ...r,
      sessions: {
        ...r.sessions,
        [passage.id]: { answers: {}, startedAt: Date.now() },
      },
    }));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="page reading reading-desk">
      <button className="reading-back" onClick={onBack}>
        <ArrowLeft size={17} />
        返回阅读书架
      </button>
      <header className="reading-title">
        <p className="eyebrow">
          {passage.topic} · {passage.level} · {readingWordCount(passage)} WORDS
        </p>
        <h1 lang="en">{passage.title}</h1>
        <p className="muted">
          {passage.questions.length} 道题 · 原创短篇练习
          {passage.id.startsWith("custom-")
            ? " · AI 导入内容，请核对解析"
            : " · 非官方真题"}
        </p>
      </header>
      <div className="reading-tabs" role="group" aria-label="切换阅读和答题">
        <button
          className={tab === "passage" ? "is-on" : ""}
          onClick={() => switchTab("passage")}
          aria-pressed={tab === "passage"}
        >
          阅读原文
        </button>
        <button
          className={tab === "questions" ? "is-on" : ""}
          onClick={() => switchTab("questions")}
          aria-pressed={tab === "questions"}
        >
          {submitted
            ? "查看解析"
            : `答题 ${answered}/${passage.questions.length}`}
        </button>
      </div>
      {saveError && (
        <p className="reading-error" role="alert">
          这台设备暂时无法保存进度，请在“我的”中尽快导出备份。
        </p>
      )}
      <div className="reading-workspace">
        <section
          className={`reading-paper ${tab !== "passage" ? "reading-mobile-hidden" : ""}`}
          aria-label="阅读原文"
        >
          <div className="reading-paper-toolbar">
            <span>THE PASSAGE</span>
            <label>
              <input
                type="checkbox"
                checked={highlight}
                onChange={(e) => setHighlight(e.target.checked)}
              />
              <Highlighter size={16} />
              标出已学词
            </label>
          </div>
          {passage.paragraphs.map((paragraph, i) => (
            <div
              className={`reading-paragraph ${located === i ? "is-located" : ""}`}
              id={`reading-paragraph-${i}`}
              key={i}
            >
              <span
                className="reading-paragraph-letter"
                aria-label={`段落 ${String.fromCharCode(65 + i)}`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <p lang="en">
                {highlight ? (
                  <ReadingHighlights text={paragraph} words={matches} />
                ) : (
                  paragraph
                )}
              </p>
            </div>
          ))}
          <details className="reading-vocabulary">
            <summary>
              本篇出现 {matches.length} 个已学词（含常见词形变化）
            </summary>
            <div className="reading-word-list">
              {matches.map((w) => (
                <button key={w.id} onClick={() => openWord(w.id)}>
                  <b>{w.word}</b>
                  <small>{w.zh}</small>
                </button>
              ))}
              {!matches.length && (
                <p className="muted">学过的词出现在文章后，会列在这里。</p>
              )}
            </div>
            <p className="muted">
              点击已学词可查看词义。阅读作答不会改变单词的复习时间。
            </p>
          </details>
          <button
            className="btn btn-primary reading-mobile-next"
            onClick={() => {
              switchTab("questions");
            }}
          >
            {submitted ? "查看题目解析" : "读完了，开始答题"}
            <ArrowRight size={17} />
          </button>
        </section>
        <section
          className={`reading-questions ${tab !== "questions" ? "reading-mobile-hidden" : ""}`}
          aria-label="阅读题目"
        >
          <div className="reading-questions-head">
            <h2>{submitted ? "回到原文，理解答案" : "读懂，再作答"}</h2>
            <p>
              判断题按原文信息作答；未提及不等于与原文矛盾。填空答案必须取自原文。
            </p>
          </div>
          {submitted && (
            <div
              className="reading-result"
              role="status"
              ref={result}
              tabIndex={-1}
            >
              <Check size={25} />
              <div>
                <b>
                  {score} <small>/ {passage.questions.length}</small>
                </b>
                <p>题答对了 · 这是练习成绩，不是雅思分数</p>
              </div>
            </div>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
              setTab("questions");
            }}
          >
            {passage.questions.map((q, i) => (
              <ReadingQuestionCard
                key={q.id}
                question={q}
                number={i + 1}
                value={session.answers[q.id] ?? ""}
                submitted={submitted}
                onAnswer={(value) => setAnswer(q.id, value)}
                onLocate={() => {
                  setLocated(q.paragraph);
                  setTab("passage");
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`reading-paragraph-${q.paragraph}`)
                      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  );
                }}
              />
            ))}
            <div className="reading-submit">
              {submitted ? (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={onBack}
                  >
                    再选一篇
                    <ArrowRight size={17} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={restart}
                  >
                    <RotateCcw size={16} />
                    重新练习
                  </button>
                </>
              ) : (
                <>
                  <p aria-live="polite">
                    {answered === passage.questions.length
                      ? "已答完，提交后查看答案和解析。"
                      : `已答 ${answered}/${passage.questions.length} 题，答案会自动保存在本机。`}
                  </p>
                  <button
                    className="btn btn-primary btn-xl"
                    disabled={answered < passage.questions.length}
                    type="submit"
                  >
                    提交并查看解析
                    <Check size={18} />
                  </button>
                </>
              )}
            </div>
          </form>
        </section>
      </div>
    </div>
  );
}

function ReadingHighlights({
  text,
  words,
}: {
  text: string;
  words: WordRef[];
}) {
  const spans = useMemo(() => readingSpans(text, words), [text, words]);
  const nodes: ReactNode[] = [];
  let end = 0;
  for (const span of spans) {
    nodes.push(text.slice(end, span.start));
    nodes.push(
      <button
        className="reading-highlight"
        key={span.start}
        onClick={() => openWord(span.word.id)}
        title={span.word.zh}
        aria-label={`查看 ${span.word.word} 的词义`}
      >
        {text.slice(span.start, span.end)}
      </button>,
    );
    end = span.end;
  }
  nodes.push(text.slice(end));
  return <>{nodes}</>;
}

function ReadingQuestionCard({
  question: q,
  number,
  value,
  submitted,
  onAnswer,
  onLocate,
}: {
  question: ReadingQuestion;
  number: number;
  value: string;
  submitted: boolean;
  onAnswer: (value: string) => void;
  onLocate: () => void;
}) {
  const correct = isReadingCorrect(q, value);
  const options =
    q.type === "tfng" ? ["TRUE", "FALSE", "NOT GIVEN"] : (q.options ?? []);
  return (
    <article
      className={`reading-question ${submitted ? (correct ? "is-correct" : "is-incorrect") : ""}`}
    >
      <fieldset disabled={submitted}>
        <legend>
          <span className="reading-question-number">{number}</span>
          <span>
            {q.type === "tfng"
              ? "TRUE / FALSE / NOT GIVEN"
              : q.type === "choice"
                ? "选择一个正确答案"
                : `从原文填写，不超过 ${q.maxWords} 个英文词`}
          </span>
        </legend>
        <p className="reading-question-prompt" lang="en">
          {q.prompt}
        </p>
        {q.type === "completion" ? (
          <input
            className="reading-fill"
            type="text"
            value={value}
            onChange={(e) => onAnswer(e.target.value)}
            maxLength={200}
            aria-label={`第 ${number} 题答案`}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
          />
        ) : (
          <div
            className={`reading-options ${q.type === "tfng" ? "is-tfng" : ""}`}
          >
            {options.map((option, i) => {
              const answer = q.type === "tfng" ? option : LETTERS[i];
              return (
                <label
                  className={value === answer ? "is-selected" : ""}
                  key={answer}
                >
                  <input
                    type="radio"
                    name={`reading-${q.id}`}
                    value={answer}
                    checked={value === answer}
                    onChange={() => onAnswer(answer)}
                  />
                  <span lang="en">
                    {q.type === "choice" && <b>{LETTERS[i]}.</b>} {option}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </fieldset>
      {submitted && (
        <div className="reading-explanation">
          <p className="reading-answer-label">
            {correct ? "✓ 回答正确" : "再看一看"} · 正确答案：<b>{q.answer}</b>
            {!correct && <small>你的答案：{value}</small>}
          </p>
          <p>{q.explanation}</p>
          <blockquote lang="en">{q.evidence}</blockquote>
          <button type="button" onClick={onLocate}>
            {q.answer === "NOT GIVEN" ? "查看相关" : "定位原文"}{" "}
            {String.fromCharCode(65 + q.paragraph)} 段<ArrowRight size={14} />
          </button>
        </div>
      )}
    </article>
  );
}
