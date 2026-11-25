// Turns dist/index.html (one self-contained file from `vite build`) into the page body that
// claude.ai Artifacts expect: no doctype/html/head/body tags, <title> first.
// Usage: npm run build && node scripts/package-artifact.mjs  → publish/command-center.html
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const pick = (tag) => {
  const m = html.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) throw new Error(`No <${tag}> in dist/index.html`);
  return m[1];
};
const head = pick("head")
  .replace(/<meta charset="utf-8"\s*\/?>/i, "")
  .replace(/<meta name="viewport"[^>]*>/i, "");
mkdirSync("publish", { recursive: true });
writeFileSync("publish/command-center.html", `${head.trim()}\n${pick("body").trim()}\n`);
console.log("Wrote publish/command-center.html");
