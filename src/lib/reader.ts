import { query } from "@solidjs/router";
import bookText from "../../content/book.txt?raw";

export type ReaderBook = {
  title: string;
  blocks: string[];
  initialPage: number;
};

export const getReaderBook = query(async (pageParam?: string) => {
  "use server";

  const { title, body } = parseTitle(bookText);
  const requestedPage = Number.parseInt(pageParam || "1", 10);
  const initialPage = Number.isFinite(requestedPage) ? Math.max(1, requestedPage) : 1;
  const blocks = getBookBlocks(body);

  return {
    title,
    blocks,
    initialPage
  } satisfies ReaderBook;
}, "reader-book");

export function getBookBlocks(rawText: string): string[] {
  const normalized = normalizeBookText(rawText);

  return normalized
    ? normalized.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean)
    : ["Edita content/book.txt para empezar a leer."];
}

function parseTitle(rawText: string) {
  const normalized = rawText.replace(/^\uFEFF/, "").trim();
  const lines = normalized.split(/\r?\n/);
  const firstLine = lines[0]?.trim() || "Kindle Reader";

  if (firstLine.startsWith("# ")) {
    return {
      title: firstLine.slice(2).trim() || "Kindle Reader",
      body: lines.slice(1).join("\n")
    };
  }

  return {
    title: "Kindle Reader",
    body: normalized
  };
}

function normalizeBookText(rawText: string) {
  return rawText
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
