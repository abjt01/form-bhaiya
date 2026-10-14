// Copies notices read by a running app into seed/, so a fresh deploy starts with a library.
// The answers are re-checked against the notice text with the current rules on the way.
// Run: node scripts/make-seed.mjs <data dir> <notice id>=<seed id> ...
import fs from "node:fs";
import path from "node:path";
import { normalise } from "../lib/reader.js";

const [dataDir, ...pairs] = process.argv.slice(2);
const notices = JSON.parse(fs.readFileSync(path.join(dataDir, "notices.json"), "utf8"));
fs.mkdirSync("seed", { recursive: true });

for (const pair of pairs) {
  const [from, to] = pair.split("=");
  const n = notices[from];
  if (!n || n.status !== "done") throw new Error(`${from} isn't a finished notice`);
  const pages = JSON.parse(fs.readFileSync(path.join(dataDir, "text", `${from}.json`), "utf8"));
  const read = Object.fromEntries(Object.entries(n.read).map(([k, v]) => [k, normalise(k, v, pages)]));
  // Hindi is left for the live app to fill in with the current prompt
  const seed = { ...n, id: to, read, hi: null };
  fs.writeFileSync(path.join("seed", `${to}.json`), JSON.stringify(seed, null, 1));
  let total = 0;
  let ok = 0;
  JSON.stringify(read, (k, v) => {
    if (v && typeof v === "object" && v.check) {
      total++;
      if (v.check.status === "verified") ok++;
    }
    return v;
  });
  console.log(`${to}: ${n.read.basics?.exam?.name} (${ok}/${total} verified)`);
}
