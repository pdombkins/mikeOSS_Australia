#!/usr/bin/env node
/**
 * Mike (Australia) — Fork & Commit Scanner
 * Scans github.com/willchen96/mike (upstream Mike OSS) for:
 *   - new commits on upstream
 *   - forks with their own commits (features you may want to adopt)
 * Keeps a register (register.json) so subsequent scans only report NEW items.
 * Outputs: reports/latest.html (+ dated copy) and reports/latest.md
 *
 * Usage:  node scan.mjs [--open-if-new] [--open] [--reset]
 * Optional auth: GITHUB_TOKEN env var, or a token in scripts/fork-scan/.token
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile, execFileSync } from "node:child_process";

const DIR = dirname(fileURLToPath(import.meta.url));
const UPSTREAM = "willchen96/mike";
const MY_FORK = "pdombkins/mikeOSS_Australia";
const REGISTER = join(DIR, "register.json");
const REPORTS = join(DIR, "reports");
const API = "https://api.github.com";

const args = process.argv.slice(2);
const OPEN_IF_NEW = args.includes("--open-if-new");
const OPEN_ALWAYS = args.includes("--open");
if (args.includes("--reset") && existsSync(REGISTER)) rmSync(REGISTER);

// ---------- auth ----------
let token = process.env.GITHUB_TOKEN || "";
const tokenFile = join(DIR, ".token");
if (!token && existsSync(tokenFile)) token = readFileSync(tokenFile, "utf8").trim();

let rateRemaining = Infinity;
let rateLimited = false;

async function gh(path) {
  if (rateRemaining <= 2) { rateLimited = true; return null; }
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "mike-australia-fork-scan" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(API + path, { headers });
  } catch (e) {
    console.error(`Network error on ${path}: ${e.message}`);
    return null;
  }
  const rem = res.headers.get("x-ratelimit-remaining");
  if (rem !== null) rateRemaining = Number(rem);
  if (res.status === 403 || res.status === 429) { rateLimited = true; return null; }
  if (!res.ok) return null;
  return res.json();
}

// ---------- register ----------
const emptyRegister = {
  version: 1,
  upstream: UPSTREAM,
  lastScan: null,
  scanCount: 0,
  nextId: 1,
  seenForks: {},   // full_name -> { pushedAt, lastAheadSha }
  seenShas: {},    // sha -> feature id (all commits ever registered)
  features: []     // { id, sha, repo, branch, category, title, author, date, url, files, status, firstSeenScan }
};
let reg = emptyRegister;
if (existsSync(REGISTER)) {
  try { reg = JSON.parse(readFileSync(REGISTER, "utf8")); } catch { reg = emptyRegister; }
}
const firstRun = reg.scanCount === 0;

// ---------- categorisation ----------
const CATEGORIES = [
  ["Legal sources & citations", /\b(citation|cite|aglc|austlii|jade|courtlistener|case ?law|statute|legislation|precedent|legal ?search|mnc)\b/i],
  ["AI & models", /\b(llm|model|claude|anthropic|gemini|openai|gpt|grok|prompt|token|stream|rag|embedding|vector)\b/i],
  ["Documents & storage", /\b(upload|pdf|docx?|document|file|r2|s3|storage|ocr|libreoffice|convert)\b/i],
  ["Cost & billing", /\b(cost|price|pricing|billing|usage|quota|credit|subscription|stripe)\b/i],
  ["Auth & database", /\b(auth|login|signup|session|supabase|rls|migration|schema|postgres|sql|database|db)\b/i],
  ["UI & frontend", /\b(ui|ux|frontend|css|tailwind|component|page|layout|dark ?mode|sidebar|button|modal|responsive|mobile|next\.?js)\b/i],
  ["Backend & API", /\b(backend|api|route|endpoint|express|server|middleware|webhook|cors)\b/i],
  ["DevOps & tooling", /\b(docker|ci|cd|deploy|github ?action|workflow|lint|eslint|test|build|env|config|dependenc)\b/i],
  ["Docs & localisation", /\b(readme|docs?|documentation|license|translat|i18n|locali[sz])\b/i],
];
const PATH_HINTS = [
  ["Legal sources & citations", /citat|legal|jade|austlii|courtlistener/i],
  ["AI & models", /llm|model|provider|prompt|anthropic|gemini|openai/i],
  ["Documents & storage", /upload|storage|document|pdf|r2/i],
  ["Cost & billing", /cost|pricing|billing/i],
  ["Auth & database", /auth|migration|supabase|sql/i],
  ["UI & frontend", /^frontend\//i],
  ["Backend & API", /^backend\//i],
  ["DevOps & tooling", /docker|\.github|\.ya?ml$|package\.json/i],
  ["Docs & localisation", /\.md$|docs\//i],
];
function categorise(message, files = []) {
  for (const [cat, re] of CATEGORIES) if (re.test(message)) return cat;
  for (const f of files) for (const [cat, re] of PATH_HINTS) if (re.test(f)) return cat;
  return "Other";
}

const skipCommit = (msg) =>
  /^(merge (branch|pull request|remote)|initial commit$|update readme(\.md)?$)/i.test(msg.trim());

// ---------- scan ----------
const newFeatures = [];
const scanNotes = [];

// Commits already in the local repo's history (e.g. upstream commits that
// predate the fork point) are not "new features" — skip them.
const localShas = (() => {
  try {
    return new Set(
      execFileSync("git", ["rev-list", "HEAD", "--max-count=20000"], {
        cwd: join(DIR, "..", ".."),
        encoding: "utf8",
      })
        .trim()
        .split("\n"),
    );
  } catch {
    return new Set();
  }
})();

function addFeature(commit, repo, branch, htmlBase, files = []) {
  const sha = commit.sha;
  if (reg.seenShas[sha]) return;
  if (localShas.has(sha)) { reg.seenShas[sha] = "-"; return; }
  const msg = (commit.commit?.message || "").split("\n")[0].slice(0, 140);
  if (skipCommit(msg)) { reg.seenShas[sha] = "-"; return; }
  const id = "F" + String(reg.nextId++).padStart(3, "0");
  const feat = {
    id, sha, repo, branch,
    category: categorise(commit.commit?.message || "", files),
    title: msg || "(no message)",
    author: commit.commit?.author?.name || commit.author?.login || "unknown",
    date: (commit.commit?.author?.date || "").slice(0, 10),
    url: `${htmlBase}/commit/${sha}`,
    files: files.slice(0, 12),
    status: "new",
    firstSeenScan: reg.scanCount + 1,
  };
  reg.seenShas[sha] = id;
  reg.features.push(feat);
  newFeatures.push(feat);
}

async function main() {
  console.log(`Scanning ${UPSTREAM} (${firstRun ? "first full scan" : "incremental"})...`);

  // 1. upstream commits
  const upCommits = await gh(`/repos/${UPSTREAM}/commits?per_page=100`);
  if (upCommits) {
    for (const c of upCommits) addFeature(c, UPSTREAM, "main", `https://github.com/${UPSTREAM}`);
  } else scanNotes.push("Could not fetch upstream commits.");

  // 2. forks (paginate)
  let forks = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await gh(`/repos/${UPSTREAM}/forks?per_page=100&page=${page}&sort=newest`);
    if (!batch || batch.length === 0) break;
    forks = forks.concat(batch);
    if (batch.length < 100) break;
  }
  console.log(`Found ${forks.length} forks. Checking for original work...`);

  // Active fork heuristic: pushed after it was created => has its own commits
  const active = forks.filter(f =>
    f.full_name.toLowerCase() !== MY_FORK.toLowerCase() &&
    new Date(f.pushed_at) > new Date(f.created_at)
  );

  // Incremental: skip forks whose pushed_at hasn't changed since last scan
  const toCheck = active.filter(f => {
    const seen = reg.seenForks[f.full_name];
    return !seen || seen.pushedAt !== f.pushed_at;
  });
  console.log(`${active.length} active forks; ${toCheck.length} need checking.`);

  for (const f of toCheck) {
    if (rateLimited) { scanNotes.push(`Rate limit reached — ${toCheck.indexOf(f)} of ${toCheck.length} active forks checked; the rest will be picked up next scan.`); break; }
    const cmp = await gh(`/repos/${UPSTREAM}/compare/main...${f.owner.login}:${f.default_branch}`);
    if (!cmp) continue;
    if (cmp.ahead_by > 0) {
      const files = (cmp.files || []).map(x => x.filename);
      for (const c of cmp.commits || []) addFeature(c, f.full_name, f.default_branch, f.html_url, files);
    }
    reg.seenForks[f.full_name] = { pushedAt: f.pushed_at, aheadBy: cmp.ahead_by ?? 0 };
  }
  // remember inactive forks too, so counts stay stable
  for (const f of forks) if (!reg.seenForks[f.full_name]) reg.seenForks[f.full_name] = { pushedAt: f.pushed_at, aheadBy: 0 };

  reg.scanCount++;
  reg.lastScan = new Date().toISOString();
  writeFileSync(REGISTER, JSON.stringify(reg, null, 2));

  writeReports(forks.length, active.length);

  console.log(`NEW_ITEMS=${newFeatures.length}`);
  if (OPEN_ALWAYS || (OPEN_IF_NEW && newFeatures.length > 0)) {
    execFile("open", [join(REPORTS, "latest.html")], () => {});
  }
}

// ---------- report ----------
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

function writeReports(totalForks, activeForks) {
  mkdirSync(REPORTS, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const items = newFeatures;
  const byCat = {};
  for (const f of items) (byCat[f.category] ||= []).push(f);
  const cats = Object.keys(byCat).sort();

  // Markdown
  let md = `# Mike OSS Fork Scan — ${date}\n\n`;
  md += `${firstRun ? "**First full scan** (baseline)." : "**Incremental scan** — new items since last scan only."}\n\n`;
  md += `Upstream: ${UPSTREAM} · Forks: ${totalForks} (${activeForks} with original work) · New features found: **${items.length}**\n\n`;
  for (const n of scanNotes) md += `> ⚠️ ${n}\n\n`;
  if (items.length === 0) md += `Nothing new since last scan.\n`;
  for (const cat of cats) {
    md += `## ${cat}\n\n`;
    for (const f of byCat[cat]) md += `- **${f.id}** · ${esc(f.title)} — \`${f.repo}\` (${f.date}) — [commit](${f.url})\n`;
    md += `\n`;
  }
  md += `\n---\nTo adopt features, tell Claude e.g.: *"Adopt F003 and F017 from the fork scan register."*\n`;
  writeFileSync(join(REPORTS, "latest.md"), md);

  // HTML
  const rows = cats.map(cat => `
    <h2>${esc(cat)} <span class="count">${byCat[cat].length}</span></h2>
    ${byCat[cat].map(f => `
    <label class="item">
      <input type="checkbox" value="${f.id}">
      <span class="fid">${f.id}</span>
      <span class="title">${esc(f.title)}</span>
      <span class="meta">${esc(f.repo)} · ${f.date} · <a href="${f.url}" target="_blank">view commit</a></span>
    </label>`).join("")}`).join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Mike OSS Fork Scan — ${date}</title>
<style>
  body{font:15px/1.5 -apple-system,system-ui,sans-serif;max-width:860px;margin:40px auto;padding:0 20px;color:#1a1a2e}
  h1{font-size:22px} h2{font-size:16px;margin:28px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .count{background:#eef;border-radius:10px;padding:1px 8px;font-size:12px;color:#446}
  .summary{background:#f6f7fb;border:1px solid #e3e5ee;border-radius:8px;padding:12px 16px;font-size:14px}
  .note{background:#fff7e6;border:1px solid #f0dcae;border-radius:8px;padding:10px 14px;margin-top:10px;font-size:13px}
  .item{display:block;padding:8px 10px;border:1px solid #e8e8ef;border-radius:8px;margin:6px 0;cursor:pointer}
  .item:hover{background:#fafaff}
  .fid{font-weight:700;color:#3b3bb3;margin:0 8px 0 6px;font-family:ui-monospace,monospace}
  .meta{display:block;margin-left:30px;font-size:12.5px;color:#777}
  .meta a{color:#3b6bb3}
  #bar{position:sticky;bottom:12px;background:#1a1a2e;color:#fff;border-radius:10px;padding:12px 16px;display:none;align-items:center;gap:12px;box-shadow:0 4px 14px rgba(0,0,0,.25)}
  #bar button{background:#4c6ef5;color:#fff;border:0;border-radius:6px;padding:8px 14px;font-size:14px;cursor:pointer}
  #bar code{background:#333356;padding:3px 8px;border-radius:5px;font-size:12.5px}
  .empty{color:#666;font-style:italic;margin-top:24px}
</style></head><body>
<h1>Mike OSS — Fork &amp; Commit Scan <small style="color:#888;font-weight:400">${date}</small></h1>
<div class="summary">
  ${firstRun ? "<b>First full scan</b> — everything below is the baseline." : "<b>Incremental scan</b> — only items new since the last scan."}<br>
  Upstream <b>${UPSTREAM}</b> · ${totalForks} forks (${activeForks} with original work) · <b>${items.length}</b> new feature commit${items.length === 1 ? "" : "s"} found.<br>
  Tick the features you want, then click <b>Copy request</b> and paste it to Claude to adopt them into Mike (Australia).
</div>
${scanNotes.map(n => `<div class="note">⚠️ ${esc(n)}</div>`).join("")}
${items.length === 0 ? `<p class="empty">Nothing new since the last scan.</p>` : rows}
<div id="bar"><span id="sel"></span><code id="cmd"></code><button onclick="copyCmd()">Copy request</button></div>
<script>
function refresh(){
  const ids=[...document.querySelectorAll('input:checked')].map(c=>c.value);
  const bar=document.getElementById('bar');
  bar.style.display=ids.length?'flex':'none';
  document.getElementById('sel').textContent=ids.length+' selected:';
  document.getElementById('cmd').textContent='Adopt '+ids.join(', ')+' from the fork scan register into Mike (Australia).';
}
document.addEventListener('change',refresh);
function copyCmd(){navigator.clipboard.writeText(document.getElementById('cmd').textContent).then(()=>{
  document.querySelector('#bar button').textContent='Copied ✓';setTimeout(()=>document.querySelector('#bar button').textContent='Copy request',1500);});}
</script>
</body></html>`;
  writeFileSync(join(REPORTS, "latest.html"), html);
  copyFileSync(join(REPORTS, "latest.html"), join(REPORTS, `scan-${date}.html`));
}

main().catch(e => { console.error(e); process.exit(1); });
