import fs from "node:fs/promises";
import path from "node:path";

// Split embedded scans into shared JPEGs so the browser loads only viewed pages.
const destination = path.resolve("public/cambridge/v1");
await fs.mkdir(path.join(destination, "pages"), { recursive: true });
const books = [];
const pages = new Map();
for (let book = 11; book <= 19; book++) {
  const pack = JSON.parse(
    await fs.readFile(`output/cambridge/剑桥雅思${book}-阅读题库.json`, "utf8"),
  );
  for (const paper of pack.passages) {
    for (const page of [...paper.pages, paper.answerPage]) {
      const match = page.image.match(
        /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match) throw Error(`Invalid scan: book ${book}, page ${page.page}`);
      const name = `c${book}-p${page.page}.jpg`;
      const bytes = Buffer.from(match[1], "base64");
      const existing = pages.get(name);
      if (existing && !existing.equals(bytes))
        throw Error(`Conflicting scan: ${name}`);
      if (!existing) {
        pages.set(name, bytes);
        await fs.writeFile(path.join(destination, "pages", name), bytes);
      }
      page.image = name;
    }
  }
  books.push(pack);
}
await fs.writeFile(
  path.join(destination, "library.json"),
  JSON.stringify(books),
);
console.log(
  `Published ${books.length} books, ${books.reduce((n, b) => n + b.passages.length, 0)} passages, ${pages.size} shared scans.`,
);
