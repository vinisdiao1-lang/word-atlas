import { useEffect, useMemo, useRef, useState } from "react";
import { useAtlas } from "../atlas/context";
import { useStore } from "../store/store";
import { loadPacks, loadRecords, save } from "../cambridge/db";
import { loadLibrary } from "../cambridge/library";
import { ExamText } from "../cambridge/Text";
import { gapParagraphs } from "../cambridge/gaps";
import { DetailedExplanation } from "../cambridge/Explanation";
import { explanationAnswerLabel } from "../cambridge/explanations";
import { repairKnownSourceAnswers } from "../cambridge/corrections";
import {
  RULES,
  grade,
  passed,
  qid,
  unorderedAnswersFor,
  requiredCorrect,
  stageNumbers,
  validatePack,
  kindLabel,
  type Attempt,
  type Pack,
  type Records,
} from "../cambridge/engine";
import "../styles/cambridge.css";
const empty: Records = { attempts: [], activeId: null };
export function Cambridge() {
  const atlas = useAtlas(),
    progress = useStore((s) => s.progress);
  const [localPacks, setLocalPacks] = useState<Pack[]>([]),
    [websitePacks, setWebsitePacks] = useState<Pack[]>([]),
    [libraryLoading, setLibraryLoading] = useState(true),
    [libraryError, setLibraryError] = useState(""),
    [libraryRetry, setLibraryRetry] = useState(0),
    [records, setRecords] = useState<Records>(empty),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(1),
    [match, setMatch] = useState(false),
    [timed, setTimed] = useState(true),
    [paperIndex, setPaperIndex] = useState(0),
    [showAll, setShowAll] = useState(false),
    [zoom, setZoom] = useState(false),
    [now, setNow] = useState(Date.now());
  const input = useRef<HTMLInputElement>(null);
  const loadedKey = useRef<string | null>(null);
  const packs = useMemo(
    () =>
      repairKnownSourceAnswers([
        ...new Map(
          [...websitePacks, ...localPacks].map((p) => [p.book, p]),
        ).values(),
      ]).sort((a, b) => a.book - b.book),
    [websitePacks, localPacks],
  );
  const papers = useMemo(() => packs.flatMap((p) => p.passages), [packs]);
  useEffect(() => {
    const controller = new AbortController();
    setLibraryLoading(true);
    setLibraryError("");
    loadLibrary(controller.signal).then(
      (p) => {
        if (!controller.signal.aborted) {
          setWebsitePacks(p);
          setLibraryLoading(false);
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setLibraryError("网站题库暂时无法加载，请检查网络后重试。");
          setLibraryLoading(false);
        }
      },
    );
    return () => controller.abort();
  }, [libraryRetry]);
  useEffect(() => {
    loadedKey.current = null;
    setReady(false);
    let live = true;
    Promise.all([loadPacks(), loadRecords(atlas.id)]).then(
      ([p, r]) => {
        if (live) {
          setLocalPacks(p);
          setRecords(r);
          loadedKey.current = atlas.id;
          setReady(true);
        }
      },
      () => {
        if (live)
          setError("无法打开本机题库，请使用普通浏览模式并允许网站存储。");
      },
    );
    return () => {
      live = false;
    };
  }, [atlas.id]);
  useEffect(() => {
    if (ready && loadedKey.current === atlas.id)
      void save("state", records, atlas.id).catch(() =>
        setError("记录未能保存，请立即导出训练记录备份。"),
      );
  }, [records, ready, atlas.id]);
  const active = records.attempts.find((a) => a.id === records.activeId);
  const activePapers =
    active?.tasks
      .map((t) => papers.find((p) => p.id === t.paperId))
      .filter((p) => !!p) ?? [];
  const done = !!active?.submittedAt;
  const update = (fn: (a: Attempt) => Attempt) =>
    setRecords((r) => ({
      ...r,
      attempts: r.attempts.map((a) => (a.id === r.activeId ? fn(a) : a)),
    }));
  useEffect(() => {
    if (!active || active.submittedAt || !active.deadline) return;
    const tick = () => setNow(Date.now());
    const timer = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    tick();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active?.id, active?.deadline, active?.submittedAt]);
  useEffect(() => {
    if (active?.deadline && !active.submittedAt && now >= active.deadline)
      update((a) =>
        a.submittedAt ? a : { ...a, submittedAt: a.deadline ?? Date.now() },
      );
  }, [now, active?.deadline, active?.submittedAt]);
  const learned = useMemo(
    () => atlas.words.filter((w) => progress.cards[w.id]),
    [atlas, progress.cards],
  );
  const coverage = useMemo(
    () =>
      new Map(
        papers.map((p) => {
          const tokens = new Set(
            p.text.toLowerCase().match(/[a-z]+(?:['-][a-z]+)*/g) ?? [],
          );
          return [
            p.id,
            learned.filter((w) => tokens.has(w.word.toLowerCase())).length,
          ];
        }),
      ),
    [papers, learned],
  );
  useEffect(() => {
    if (!ready || !papers.length) return;
    setRecords((r) => {
      let changed = false;
      const attempts = r.attempts.map((a) => {
        if (a.mode !== "stage" || a.stage !== 1 || a.submittedAt) return a;
        const tasks = a.tasks.map((task) => {
          const paper = papers.find((p) => p.id === task.paperId);
          if (!paper || task.numbers.join(",") === paper.numbers.join(","))
            return task;
          changed = true;
          return { ...task, numbers: [...paper.numbers] };
        });
        return tasks.some((task, i) => task !== a.tasks[i])
          ? { ...a, tasks }
          : a;
      });
      return changed ? { ...r, attempts } : r;
    });
  }, [ready, papers]);
  const candidates = papers
    .filter(
      (p) =>
        p.book < 19 &&
        p.passage === stage &&
        stageNumbers(p, stage).length &&
        (!match || (coverage.get(p.id) ?? 0) > 0),
    )
    .sort((a, b) =>
      match
        ? (coverage.get(b.id) ?? 0) - (coverage.get(a.id) ?? 0)
        : a.book - b.book || a.test - b.test,
    );
  const start = (mode: "stage" | "mock", ids: string[]) => {
    const chosen = ids.map((id) => papers.find((p) => p.id === id)!);
    const a: Attempt = {
      id: `exam-${Date.now()}`,
      mode,
      stage: mode === "stage" ? stage : 0,
      tasks: chosen.map((p) => ({
        paperId: p.id,
        numbers: mode === "mock" ? p.numbers : stageNumbers(p, stage),
      })),
      answers: {},
      marks: {},
      notes: {},
      startedAt: Date.now(),
      ...(mode === "mock" && timed ? { deadline: Date.now() + 3600000 } : {}),
    };
    setRecords((r) => ({
      attempts: [...r.attempts, a].slice(-100),
      activeId: a.id,
    }));
    setPaperIndex(0);
    setShowAll(false);
    setZoom(false);
    setNow(Date.now());
    window.scrollTo(0, 0);
  };
  const importFiles = async (files: FileList | null) => {
    if (!files) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files)) {
        if (f.size > 60 * 1024 * 1024)
          throw Error("单个题库文件不能超过 60 MB。");
        const data = JSON.parse(await f.text());
        if (data.format === "word-atlas-exam-records-v1") {
          if (
            !data.records ||
            !Array.isArray(data.records.attempts) ||
            data.records.attempts.length > 100 ||
            data.records.attempts.some(
              (a: Attempt) =>
                !a ||
                typeof a.id !== "string" ||
                !["stage", "mock"].includes(a.mode) ||
                (a.mode === "stage"
                  ? ![1, 2, 3].includes(a.stage)
                  : a.stage !== 0) ||
                (a.deadline !== undefined &&
                  (!Number.isFinite(a.deadline) || a.deadline < a.startedAt)) ||
                (a.submittedAt !== undefined &&
                  !Number.isFinite(a.submittedAt)) ||
                !Array.isArray(a.tasks) ||
                !a.tasks.length ||
                a.tasks.length > 3 ||
                !a.answers ||
                !a.notes ||
                !a.marks ||
                !Number.isFinite(a.startedAt) ||
                a.tasks.some(
                  (t) =>
                    typeof t.paperId !== "string" ||
                    !Array.isArray(t.numbers) ||
                    t.numbers.some(
                      (n) => !Number.isInteger(n) || n < 1 || n > 40,
                    ),
                ) ||
                Object.values(a.answers).some(
                  (s) => typeof s !== "string" || s.length > 200,
                ) ||
                Object.values(a.notes).some(
                  (s) => typeof s !== "string" || s.length > 2000,
                ) ||
                Object.values(a.marks).some((s) => typeof s !== "boolean"),
            )
          )
            throw Error("训练记录备份无效。");
          setRecords((r) => ({
            attempts: [
              ...r.attempts.filter(
                (a) =>
                  !data.records.attempts.some((b: Attempt) => b.id === a.id),
              ),
              ...data.records.attempts,
            ].slice(-100),
            activeId: null,
          }));
        } else {
          const pack = validatePack(data);
          await save("packs", pack);
          setLocalPacks((p) =>
            [...p.filter((x) => x.book !== pack.book), pack].sort(
              (a, b) => a.book - b.book,
            ),
          );
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败，请检查文件。");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const exportRecords = () => {
    const blob = new Blob(
      [JSON.stringify({ format: "word-atlas-exam-records-v1", records })],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "剑桥阅读-训练记录.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  if (!ready && !error) return <div className="page">正在打开本机真题库…</div>;
  const result = active ? grade(active, papers) : null;
  const paper = activePapers[Math.min(paperIndex, activePapers.length - 1)];
  const textPaper =
    websitePacks.flatMap((p) => p.passages).find((p) => p.id === paper?.id) ??
    paper;
  return (
    <div className="page cambridge">
      <a className="link" href="#/reading">
        ← 返回阅读书架
      </a>
      <header className={`page-head ${active ? "exam-compact-head" : ""}`}>
        <p className="eyebrow">CAMBRIDGE · 真题训练</p>
        <h1 className="display">
          从专项突破，
          <br />
          到完整模考。
        </h1>
        <p className="lede">
          剑 11–18 可自由选择 Passage 练习，剑 19 保留原卷顺序做考前模拟。
        </p>
      </header>
      {error && (
        <p className="exam-error" role="alert">
          {error}
        </p>
      )}
      <section
        className={`panel exam-import ${active && activePapers.length === active.tasks.length ? "is-collapsed" : ""}`}
      >
        <b>
          可用题库：
          {packs.length
            ? packs.map((p) => `剑${p.book}`).join("、")
            : libraryLoading
              ? "正在加载…"
              : "暂不可用"}
        </b>
        <p className="muted">
          剑11–19文字版与1,440道逐题解析已内置，交卷后可查看原文依据和详细解题过程。答题记录和复盘笔记保存在当前设备，请定期导出备份。
        </p>
        {libraryLoading && (
          <p className="muted" role="status">
            正在加载网站题库…
          </p>
        )}
        {libraryError && (
          <p className="exam-error" role="alert">
            {libraryError}{" "}
            <button
              className="btn btn-ghost"
              onClick={() => setLibraryRetry((n) => n + 1)}
            >
              重试加载
            </button>
          </p>
        )}
        <div className="exam-actions">
          <button
            className="btn btn-primary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy ? "正在导入…" : "导入训练备份 / 本地题库"}
          </button>
          <button className="btn btn-ghost" onClick={exportRecords}>
            导出训练记录
          </button>
          <input
            ref={input}
            hidden
            type="file"
            multiple
            accept=".json,application/json"
            onChange={(e) => void importFiles(e.target.files)}
          />
        </div>
      </section>
      {active && activePapers.length !== active.tasks.length ? (
        <div className="panel">
          <p>
            {libraryLoading
              ? "正在加载这份练习的题库…"
              : "暂时无法打开这份练习，请重试加载网站题库，或导入对应册数。"}
          </p>
          <button
            className="btn btn-ghost"
            onClick={() => setRecords((r) => ({ ...r, activeId: null }))}
          >
            返回训练列表
          </button>
        </div>
      ) : active && paper && result ? (
        <>
          <section className="panel exam-session">
            <div className="exam-actions">
              <button
                className="btn btn-ghost"
                onClick={() => setRecords((r) => ({ ...r, activeId: null }))}
              >
                保存并返回
              </button>
              <strong>
                {active.mode === "mock"
                  ? "剑19 · 完整阅读模考"
                  : `阶段 ${active.stage} · ${RULES[active.stage - 1].name}`}
              </strong>
              {active.deadline && !done ? (
                <b className="exam-clock" role="timer" aria-label="剩余时间">
                  {Math.floor(Math.max(0, active.deadline - now) / 60000)}:
                  {String(
                    Math.floor(Math.max(0, active.deadline - now) / 1000) % 60,
                  ).padStart(2, "0")}
                </b>
              ) : (
                <span>
                  {done
                    ? "已提交"
                    : active.mode === "mock"
                      ? "不计时模式"
                      : "专项练习"}
                </span>
              )}
            </div>
            <p className="muted">
              仅填写下方列出的原卷题号。
              {active.mode === "stage"
                ? `本次 ${result.total} 题，答对 ${requiredCorrect(active.stage, result.total)} 题达标。`
                : "三篇共 40 题；计时模式结束会自动交卷，离开页面不会暂停。"}
            </p>
            {done ? (
              <div className="exam-score" role="status">
                <b>
                  {result.correct}/{result.total}
                </b>
                <span>
                  {result.pending
                    ? `${result.pending} 题答案待核对，暂不判定达标`
                    : active.mode === "stage"
                      ? passed(active, papers)
                        ? "已达标"
                        : "尚未达标，先复盘再练习"
                      : "模考完成，以下复盘不换算雅思分数"}
                </span>
              </div>
            ) : (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const missing = active.tasks
                    .flatMap((t) => t.numbers.map((n) => qid(t.paperId, n)))
                    .filter((id) => !active.answers[id]?.trim()).length;
                  if (
                    missing &&
                    !confirm(`还有 ${missing} 题未作答，仍要交卷吗？`)
                  )
                    return;
                  update((a) => ({ ...a, submittedAt: Date.now() }));
                  window.scrollTo(0, 0);
                }}
              >
                提交本次练习
              </button>
            )}
          </section>
          <div className="exam-actions exam-paper-tabs">
            {activePapers.map((p, i) => (
              <button
                key={p.id}
                className={`btn ${i === paperIndex ? "btn-primary" : "btn-ghost"}`}
                onClick={() => {
                  setPaperIndex(i);
                  setZoom(false);
                }}
              >
                剑{p.book} T{p.test} P{p.passage}
              </button>
            ))}
            {done && (
              <label>
                <input
                  type="checkbox"
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                />
                显示全部题目（默认只看错题和待核对题）
              </label>
            )}
          </div>
          <div className="exam-jumps">
            <button
              className="btn btn-ghost"
              onClick={() =>
                document
                  .getElementById("exam-original")
                  ?.scrollIntoView({ block: "start" })
              }
            >
              读文章
            </button>
            <button
              className="btn btn-ghost"
              onClick={() =>
                document
                  .getElementById("exam-answer-sheet")
                  ?.scrollIntoView({ block: "start" })
              }
            >
              {done ? "错题复盘" : "做题"}
            </button>
            <small>
              已答{" "}
              {
                active.tasks
                  .flatMap((t) => t.numbers.map((n) => qid(t.paperId, n)))
                  .filter((id) => active.answers[id]?.trim()).length
              }
              /{result.total}
            </small>
            {active.deadline && !done && (
              <b>
                {Math.floor(Math.max(0, active.deadline - now) / 60000)}:
                {String(
                  Math.floor(Math.max(0, active.deadline - now) / 1000) % 60,
                ).padStart(2, "0")}
              </b>
            )}
          </div>
          <div className="exam-workspace">
            <section className="panel exam-original" id="exam-original">
              <p className="eyebrow">READING PASSAGE {paper.passage}</p>
              <h2 className="exam-reading-title">
                {textPaper.reading?.title ?? paper.title}
              </h2>
              <ExamText
                article
                paragraphId={(i) => `exam-paragraph-${paper.id}-${i + 1}`}
                paragraphs={textPaper.reading?.paragraphs ?? [paper.text]}
              />
              <details className="exam-source-check">
                <summary>核对原卷图片</summary>
                <p className="muted">
                  剑{paper.book} · Test {paper.test} · Passage {paper.passage} ·
                  PDF 第 {paper.sourceStart}–{paper.sourceEnd} 页
                  {paper.ocr ? " · 扫描页文字匹配来自 OCR" : ""}
                </p>
                <button
                  className="btn btn-ghost"
                  onClick={() => setZoom(!zoom)}
                >
                  {zoom ? "适合屏幕" : "放大原页（可横向滚动）"}
                </button>
                <div className={`exam-images ${zoom ? "is-zoomed" : ""}`}>
                  {paper.pages.map((p) => (
                    <img
                      key={p.page}
                      src={p.image}
                      alt={`原卷 PDF 第 ${p.page} 页`}
                      loading="lazy"
                    />
                  ))}
                </div>
              </details>
            </section>
            <section className="panel exam-answer-sheet" id="exam-answer-sheet">
              <h2>{done ? "错题复盘" : "阅读题目"}</h2>
              {done && (
                <p className="muted">
                  查看本题原文定位、解题过程、同义改写和易错点。可核对原始答案页、修正判分，并记录复盘笔记。
                </p>
              )}
              {active.tasks
                .find((t) => t.paperId === paper.id)!
                .numbers.filter(
                  (n) =>
                    !done || showAll || result.marks[qid(paper.id, n)] !== true,
                )
                .map((n, index, visible) => {
                  const id = qid(paper.id, n),
                    g = paper.groups.find((g) => n >= g.from && n <= g.to),
                    mark = result.marks[id],
                    section = textPaper.questionText?.find(
                      (s) => s.from === g?.from,
                    ),
                    item = section?.items?.find((item) => item.number === n),
                    firstInGroup =
                      index === 0 || (g && visible[index - 1] < g.from),
                    inline = g && section ? gapParagraphs(g, section) : null;
                  if (inline && !done && !firstInGroup) return null;
                  return (
                    <div
                      className={`exam-answer ${done ? (mark === true ? "is-right" : mark === false ? "is-wrong" : "is-pending") : ""}`}
                      key={id}
                    >
                      {firstInGroup && section && (
                        <div className="exam-question-context">
                          <h3>
                            Questions {section.from}
                            {section.to !== section.from
                              ? `–${section.to}`
                              : ""}
                          </h3>
                          <ExamText
                            paragraphs={
                              inline ??
                              (section.items
                                ? (section.intro ?? [])
                                : section.paragraphs)
                            }
                            renderGap={
                              inline
                                ? (number) => {
                                    const gapId = qid(paper.id, number);
                                    return (
                                      <span className="exam-inline-gap">
                                        <sup>{number}</sup>
                                        <input
                                          id={`answer-${number}`}
                                          aria-label={`第 ${number} 题填空`}
                                          type="text"
                                          maxLength={200}
                                          autoComplete="off"
                                          autoCapitalize="none"
                                          spellCheck={false}
                                          disabled={done}
                                          value={active.answers[gapId] ?? ""}
                                          onChange={(e) =>
                                            update((a) =>
                                              a.submittedAt ||
                                              (a.deadline &&
                                                Date.now() >= a.deadline)
                                                ? a
                                                : {
                                                    ...a,
                                                    answers: {
                                                      ...a.answers,
                                                      [gapId]: e.target.value,
                                                    },
                                                  },
                                            )
                                          }
                                        />
                                      </span>
                                    );
                                  }
                                : undefined
                            }
                          />
                          {paper.unorderedAnswerSets
                            ?.filter((set) =>
                              set.every(
                                (n) => n >= section.from && n <= section.to,
                              ),
                            )
                            .map((set) => (
                              <p className="muted" key={set.join("-")}>
                                第 {set.join("、")}{" "}
                                题答案顺序不限，每个答案只能使用一次。
                              </p>
                            ))}
                          {section.judgmentOptions && (
                            <p className="muted">
                              请选择 {section.judgmentOptions.join(" / ")}。
                            </p>
                          )}
                        </div>
                      )}
                      {(!inline || done) && (
                        <label htmlFor={`answer-${n}`}>
                          <b>第 {n} 题</b>
                          <small>
                            {g ? kindLabel[g.type] : ""}
                            {unorderedAnswersFor(paper, n)
                              ? " · 本组答案可任意顺序"
                              : ""}
                          </small>
                        </label>
                      )}
                      {item && <ExamText paragraphs={item.paragraphs} />}
                      {inline ? null : section?.judgmentOptions && !done ? (
                        <div
                          className="exam-answer-options"
                          role="group"
                          aria-label={`第 ${n} 题答案`}
                        >
                          {section.judgmentOptions.map((option) => (
                            <button
                              key={option}
                              className={`btn ${active.answers[id] === option ? "btn-primary" : "btn-ghost"}`}
                              aria-pressed={active.answers[id] === option}
                              onClick={() =>
                                update((a) =>
                                  a.submittedAt ||
                                  (a.deadline && Date.now() >= a.deadline)
                                    ? a
                                    : {
                                        ...a,
                                        answers: { ...a.answers, [id]: option },
                                      },
                                )
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <input
                          id={`answer-${n}`}
                          type="text"
                          maxLength={200}
                          autoComplete="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          disabled={done}
                          value={active.answers[id] ?? ""}
                          onChange={(e) =>
                            update((a) =>
                              a.submittedAt ||
                              (a.deadline !== undefined &&
                                Date.now() >= a.deadline)
                                ? a
                                : {
                                    ...a,
                                    answers: {
                                      ...a.answers,
                                      [id]: e.target.value,
                                    },
                                  },
                            )
                          }
                        />
                      )}
                      {done && (
                        <>
                          <p>
                            参考答案：
                            <b>
                              {paper.answers[n]
                                ? explanationAnswerLabel(paper, n)
                                : "未可靠识别，请查看原始答案页"}
                            </b>
                          </p>
                          <p>
                            {mark === true
                              ? "答对"
                              : mark === false
                                ? "答错 / 未作答"
                                : "待核对"}
                            {id in active.marks ? "（已人工核对）" : ""}
                          </p>
                          <div className="exam-actions">
                            <button
                              className="btn btn-ghost"
                              onClick={() =>
                                update((a) => ({
                                  ...a,
                                  marks: { ...a.marks, [id]: true },
                                }))
                              }
                            >
                              核对后标为答对
                            </button>
                            <button
                              className="btn btn-ghost"
                              onClick={() =>
                                update((a) => ({
                                  ...a,
                                  marks: { ...a.marks, [id]: false },
                                }))
                              }
                            >
                              标为答错
                            </button>
                          </div>
                          <DetailedExplanation
                            paper={textPaper}
                            number={n}
                            userAnswer={active.answers[id] ?? ""}
                            onLocate={(paragraph) => {
                              const element = document.getElementById(
                                `exam-paragraph-${paper.id}-${paragraph}`,
                              );
                              element?.focus({ preventScroll: true });
                              element?.scrollIntoView({
                                block: "start",
                                behavior: window.matchMedia(
                                  "(prefers-reduced-motion: reduce)",
                                ).matches
                                  ? "auto"
                                  : "smooth",
                              });
                              element?.classList.remove("exam-evidence-focus");
                              requestAnimationFrame(() =>
                                element?.classList.add("exam-evidence-focus"),
                              );
                            }}
                          />
                          <label htmlFor={`note-${n}`}>复盘笔记</label>
                          <textarea
                            id={`note-${n}`}
                            rows={4}
                            maxLength={2000}
                            value={active.notes[id] ?? ""}
                            placeholder="原文定位在哪一页、哪一段？错在词义、同义改写、定位，还是 FALSE / NOT GIVEN？下次如何避免？"
                            onChange={(e) =>
                              update((a) => ({
                                ...a,
                                notes: { ...a.notes, [id]: e.target.value },
                              }))
                            }
                          />
                        </>
                      )}
                    </div>
                  );
                })}
              {done && (
                <details>
                  <summary>
                    展开原始答案页（PDF 第 {paper.answerPage.page} 页）
                  </summary>
                  <img
                    className="exam-key"
                    src={paper.answerPage.image}
                    alt="原书参考答案页"
                  />
                </details>
              )}
            </section>
          </div>
        </>
      ) : (
        <>
          <section className="exam-stages">
            {RULES.map((r, i) => (
              <button
                key={r.name}
                className={`panel ${stage === i + 1 ? "is-on" : ""}`}
                onClick={() => setStage(i + 1)}
              >
                <small>
                  阶段 {i + 1} · Passage {i + 1}
                </small>
                <h2>{r.name}</h2>
                <p>
                  {i === 0
                    ? "完整 13 题 · 全部原卷题型"
                    : r.types.map((t) => kindLabel[t]).join(" + ")}
                </p>
                <b>
                  {i === 0
                    ? "答对 11/13 达标"
                    : `答对 ≥ ${r.numerator}/${r.denominator}，按实际题数向上取整`}
                </b>
              </button>
            ))}
          </section>
          <section className="panel">
            <h2>阶段 {stage}：选择练习</h2>
            <label className="exam-match">
              <input
                type="checkbox"
                checked={match}
                onChange={(e) => setMatch(e.target.checked)}
              />
              只看包含已背单词的文章（按原形匹配并优先覆盖更多词）
            </label>
            <p className="muted">
              已学 {learned.length} 词。
              {stage === 1
                ? "Passage 1 每篇练完整的第 1–13 题，答对 11 题达标。"
                : "本阶段练指定题型，按本篇实际筛选题数等比例计算达标。"}
              三个阶段均可自由选择。 T1–T4 表示本册第 1–4 套；剑12 对应原书 Test
              5–8。
            </p>
            <div className="exam-candidates">
              {candidates.map((p) => {
                const nums = stageNumbers(p, stage);
                return (
                  <button
                    className="exam-candidate"
                    key={p.id}
                    onClick={() => start("stage", [p.id])}
                  >
                    <b>
                      剑{p.book} · T{p.test} · P{p.passage}
                    </b>
                    <span className="exam-candidate-title">{p.title}</span>
                    <span>原卷第 {nums.join("、")} 题</span>
                    <small>
                      {nums.length} 题 · 至少答对{" "}
                      {requiredCorrect(stage, nums.length)} 题 · 含{" "}
                      {coverage.get(p.id) ?? 0} 个已学词
                    </small>
                  </button>
                );
              })}
            </div>
            {!candidates.length && (
              <p className="muted">
                {libraryLoading
                  ? "正在加载练习文章…"
                  : match
                    ? "暂无匹配文章，可以关闭已背词筛选。"
                    : "暂无可用文章，请重试加载网站题库。"}
              </p>
            )}
          </section>
          <section className="panel exam-mock">
            <h2>剑19 · 考前整套阅读模考</h2>
            <p className="muted">
              保持原卷三篇、40 题及题型顺序，不按已背词筛选。
            </p>
            <label>
              <input
                type="checkbox"
                checked={timed}
                onChange={(e) => setTimed(e.target.checked)}
              />
              60 分钟计时，到时自动交卷
            </label>
            <div className="exam-actions">
              {[1, 2, 3, 4].map((t) => (
                <button
                  key={t}
                  className="btn btn-primary"
                  disabled={!packs.some((p) => p.book === 19)}
                  onClick={() =>
                    start(
                      "mock",
                      papers
                        .filter((p) => p.book === 19 && p.test === t)
                        .sort((a, b) => a.passage - b.passage)
                        .map((p) => p.id),
                    )
                  }
                >
                  开始 Test {t}
                </button>
              ))}
            </div>
          </section>
          <section className="panel">
            <h2>训练记录与错题复盘</h2>
            {records.attempts.length === 0 ? (
              <p className="muted">完成或暂停的练习会出现在这里。</p>
            ) : (
              [...records.attempts].reverse().map((a) => {
                const g = grade(a, papers);
                return (
                  <button
                    className="exam-history"
                    key={a.id}
                    onClick={() => {
                      setRecords((r) => ({ ...r, activeId: a.id }));
                      setPaperIndex(0);
                      setShowAll(false);
                      window.scrollTo(0, 0);
                    }}
                  >
                    <span>
                      {a.mode === "mock" ? "剑19 模考" : `阶段 ${a.stage}`} ·{" "}
                      {new Date(a.startedAt).toLocaleDateString("zh-CN")}
                    </span>
                    <b>
                      {a.submittedAt
                        ? `${g.correct}/${g.total}${g.pending ? " · 待核对" : ""}`
                        : "继续未完成练习"}
                    </b>
                  </button>
                );
              })
            )}
          </section>
        </>
      )}
      <p className="muted">
        网站已内置剑11–19题库。浏览器清理数据前，请导出训练记录；更换设备时只需导入训练备份。
      </p>
    </div>
  );
}
