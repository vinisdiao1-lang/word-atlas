import { validatePack, type Pack } from "./engine";

export async function loadLibrary(signal?: AbortSignal): Promise<Pack[]> {
  const root = `${import.meta.env.BASE_URL}cambridge/v1/`;
  const response = await fetch(
    `${import.meta.env.BASE_URL}cambridge/v2/library.json`,
    { signal },
  );
  if (!response.ok) throw Error("网站题库暂时无法加载，请检查网络后重试。");
  return parseLibrary(await response.json(), `${root}pages/`);
}

export function parseLibrary(value: unknown, imageRoot: string): Pack[] {
  if (!Array.isArray(value) || value.length !== 9)
    throw Error("网站题库不完整，请重试。");
  const packs = value.map((raw: Pack) => {
    const pack = structuredClone(raw);
    for (const paper of pack.passages) {
      for (const page of [...paper.pages, paper.answerPage]) {
        if (
          typeof page.image !== "string" ||
          !/^c1[1-9]-p[0-9]+\.jpg$/.test(page.image)
        )
          throw Error("网站原页路径无效。");
        page.image = imageRoot + page.image;
      }
    }
    return validatePack(pack, imageRoot);
  });
  if (new Set(packs.map((pack) => pack.book)).size !== 9)
    throw Error("网站题库册数不完整。");
  return packs;
}
