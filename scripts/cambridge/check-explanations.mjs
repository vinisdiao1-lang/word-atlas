import fs from "node:fs";
import { validateExplanation } from "../../src/cambridge/explanations.ts";
const source = JSON.parse(
  fs.readFileSync("public/cambridge/v2/library.json", "utf8"),
);
const partial = process.argv.includes("--partial");
let total = 0,
  errors = 0;
for (const pack of source) {
  const path = `public/cambridge/explanations/c${pack.book}.json`;
  if (!fs.existsSync(path)) {
    console.log(`剑${pack.book}: 0/160`);
    if (!partial) errors++;
    continue;
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path, "utf8"));
  } catch (e) {
    console.log(`剑${pack.book}: JSON无效 ${e.message}`);
    errors++;
    continue;
  }
  let valid = 0;
  if (
    data.format !== "word-atlas-explanations-v1" ||
    data.book !== pack.book ||
    !data.items ||
    Array.isArray(data.items)
  ) {
    console.log(`剑${pack.book}: 解析格式或册号无效`);
    errors++;
    continue;
  }
  const expectedIds = new Set(
    pack.passages.flatMap((p) => p.numbers.map((n) => `${p.id}:${n}`)),
  );
  for (const id of Object.keys(data.items))
    if (!expectedIds.has(id)) {
      console.log(`未知题号 ${id}`);
      errors++;
    }
  for (const p of pack.passages)
    for (const n of p.numbers) {
      const id = `${p.id}:${n}`;
      if (!data.items?.[id]) {
        if (!partial) {
          console.log(`缺少 ${id}`);
          errors++;
        }
        continue;
      }
      try {
        const e = validateExplanation(data.items[id], p, n);
        if (e.reasoning.join("").replace(/[^\u3400-\u9fff]/g, "").length < 60)
          throw Error("具体中文论证不足60字");
        const group = p.groups.find((g) => n >= g.from && n <= g.to);
        if (group?.type === "choice") {
          const labels = e.options?.map((o) => o.label).join("");
          if (labels !== (group.anyOrder ? "ABCDE" : "ABCD"))
            throw Error("选择题缺少完整逐项分析");
          const correct = new Set(
            (group.anyOrder
              ? p.numbers.filter((i) => i >= group.from && i <= group.to)
              : [n]
            ).map((i) => p.answers[i].toUpperCase()),
          );
          if (e.options.some((o) => o.correct !== correct.has(o.label)))
            throw Error("选项成立标记与原卷答案不符");
        }
        valid++;
      } catch (e) {
        console.log(`${id}: ${e.message}`);
        errors++;
      }
    }
  total += valid;
  console.log(`剑${pack.book}: ${valid}/160`);
}
console.log(`有效解析 ${total}/1440；错误 ${errors}`);
if (errors || (!partial && total !== 1440)) process.exitCode = 1;
