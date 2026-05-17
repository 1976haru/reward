import { createHash } from "node:crypto";
import * as cheerio from "cheerio";

export function normalizeContentForHash(text: string): string {
  if (!text) return "";
  return String(text)
    .replace(/[​-‍﻿]/g, "")  // zero-width
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function hashText(text: string): string {
  const norm = normalizeContentForHash(text);
  return createHash("sha256").update(norm, "utf8").digest("hex");
}

export function hashHtml(html: string): string {
  if (!html) return hashText("");
  try {
    const $ = cheerio.load(html);
    $("script, style, noscript, svg, canvas, iframe").remove();
    const bodyText = ($("body").length ? $("body").text() : $.root().text());
    return hashText(bodyText);
  } catch {
    return hashText(html);
  }
}
