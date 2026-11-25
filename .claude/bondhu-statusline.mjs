#!/usr/bin/env node
/**
 * bondhu statusline for Claude Code — port of pi-bondhu's minimal (sleep) line.
 *
 *   🧠 model  |  ⚡️ ↑in ↓out ♻️ cache 💸 $cost  |  ⏰ elapsed · 🔁 turns   ● ▕████░░▏ 12.3% / 200k
 *
 * Reads the statusline JSON payload on stdin (see `claude --help`, statusLine docs).
 * Session token totals and turn counts are parsed incrementally from the session
 * transcript, with a per-session cache under /tmp so repeated 300ms refreshes stay cheap.
 */

import { readFileSync, statSync, mkdirSync, writeFileSync, openSync, readSync, closeSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// --- formatting (mirrors pi-bondhu/src/widget.ts) ---

function formatTokens(count) {
  if (!Number.isFinite(count) || count <= 0) return "0";
  if (count < 1_000) return `${count}`;
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}k`;
  if (count < 1_000_000) return `${Math.round(count / 1_000)}k`;
  if (count < 10_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  return `${Math.round(count / 1_000_000)}M`;
}

function formatElapsed(ms) {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// --- terminal width ---

function debugLog(...parts) {
  if (!process.env.BONDHU_SL_DEBUG) return;
  try {
    appendFileSync(join(cacheDir(), "debug.log"), `${new Date().toISOString()} ${parts.map((p) => (typeof p === "object" ? JSON.stringify(p) : String(p))).join(" ")}\n`);
  } catch { /* best effort */ }
}

// --- ANSI / width helpers ---

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const GOLD = "\x1b[38;2;181;158;101m";

function visibleWidth(s) {
  let w = 0;
  const cps = [...s.replace(/\x1b\[[0-9;]*m/g, "")].map((c) => c.codePointAt(0));
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === 0xfe0f) continue; // variation selector — counted with its base
    if (cps[i + 1] === 0xfe0f) { w += 2; i++; continue; } // emoji presentation → 2 cells
    w += cps[i] >= 0x1f300 ? 2 : 1;
  }
  return w;
}

/** Truncate plain text (no ANSI) to a cell width with an ellipsis. */
function truncateToWidth(s, maxWidth) {
  if (visibleWidth(s) <= maxWidth) return s;
  const cps = [...s].map((c) => c.codePointAt(0));
  let w = 0;
  let out = "";
  for (let i = 0; i < cps.length; i++) {
    if (cps[i] === 0xfe0f) continue;
    const cw = cps[i + 1] === 0xfe0f ? 2 : cps[i] >= 0x1f300 ? 2 : 1;
    if (w + cw > maxWidth - 1) break; // leave room for "…"
    out += String.fromCodePoint(cps[i]);
    if (cps[i + 1] === 0xfe0f) out += "\u{FE0F}";
    w += cw;
  }
  return `${out}…`;
}

// --- transcript parsing (incremental, cached) ---

const EMPTY_TOTALS = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, turns: 0 };

function cacheDir() {
  const dir = join(tmpdir(), "bondhu-cc-statusline");
  try { mkdirSync(dir, { recursive: true }); } catch { /* best effort */ }
  return dir;
}

function readCache(sessionId, transcriptPath) {
  try {
    const cached = JSON.parse(readFileSync(join(cacheDir(), `${sessionId}.json`), "utf8"));
    if (cached.transcriptPath === transcriptPath) return cached;
  } catch { /* no cache yet */ }
  return null;
}

function writeCache(sessionId, cache) {
  try { writeFileSync(join(cacheDir(), `${sessionId}.json`), JSON.stringify(cache)); } catch { /* best effort */ }
}

/** Does this user entry carry real user text (not tool results / meta)? */
function isRealUserTurn(entry) {
  if (entry?.type !== "user" || entry.isMeta) return false;
  const c = entry?.message?.content;
  if (typeof c === "string") return c.trim().length > 0 && !c.trimStart().startsWith("<");
  if (!Array.isArray(c)) return false;
  const hasText = c.some((b) => b?.type === "text" && typeof b.text === "string" && b.text.trim() && !b.text.trimStart().startsWith("<"));
  const hasToolResult = c.some((b) => b?.type === "tool_result");
  return hasText && !hasToolResult;
}

/**
 * Session totals + turn count from the transcript, reading only bytes appended
 * since the previous run. Deduplicates by assistant message id (Claude Code
 * writes repeated lines per streaming message).
 */
function sessionUsage(transcriptPath, sessionId) {
  const cached = readCache(sessionId, transcriptPath);
  let size = 0;
  try { size = statSync(transcriptPath).size; } catch { return { ...EMPTY_TOTALS, turns: 0, cache: cached }; }

  let state = cached && cached.size <= size
    ? { size: cached.size, remainder: cached.remainder ?? "", seen: new Set(cached.seen ?? []), totals: { ...EMPTY_TOTALS, ...cached.totals }, turns: cached.turns ?? 0 }
    : { size: 0, remainder: "", seen: new Set(), totals: { ...EMPTY_TOTALS }, turns: 0 };

  let fh;
  try { fh = openSync(transcriptPath, "r"); } catch { return { ...state.totals, turns: state.turns, cache: state }; }
  try {
    const CHUNK = 256 * 1024;
    const buf = Buffer.alloc(CHUNK);
    while (state.size < size) {
      const n = readSync(fh, buf, 0, Math.min(CHUNK, size - state.size), state.size);
      if (n <= 0) break;
      state.size += n;
      state.remainder += buf.toString("utf8", 0, n);
      let nl;
      while ((nl = state.remainder.indexOf("\n")) !== -1) {
        const line = state.remainder.slice(0, nl);
        state.remainder = state.remainder.slice(nl + 1);
        processLine(line, state);
      }
      // Incomplete trailing line stays in state.remainder; it is prepended to
      // the bytes read on the next run so no entry is ever lost mid-write.
    }
  } finally {
    closeSync(fh);
  }

  const seen = [...state.seen];
  if (seen.length > 5_000) seen.splice(0, seen.length - 5_000); // cap growth
  return {
    ...state.totals,
    turns: state.turns,
    cache: { transcriptPath, size: state.size, remainder: state.remainder, seen, totals: state.totals, turns: state.turns },
  };

  function processLine(line, st) {
    line = line.trim();
    if (!line) return;
    let e;
    try { e = JSON.parse(line); } catch { return; }
    const msg = e?.message;
    if (e.type === "assistant" && msg?.usage) {
      const id = msg.id;
      if (id) {
        if (st.seen.has(id)) return;
        st.seen.add(id);
      }
      const u = msg.usage;
      st.totals.input += u.input_tokens ?? 0;
      st.totals.output += u.output_tokens ?? 0;
      st.totals.cacheRead += u.cache_read_input_tokens ?? 0;
      st.totals.cacheWrite += u.cache_creation_input_tokens ?? 0;
    } else if (isRealUserTurn(e)) {
      st.turns++;
    }
  }
}

// --- line assembly (mirrors buildMinimalLine) ---

function buildMinimalLine(payload, usage) {
  const model = String(payload?.model?.display_name ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
  const effort = payload?.effort?.level;
  const modelLine = effort ? `🧠 ${model} • ${effort}` : `🧠 ${model}`;

  const statsParts = ["⚡️", `↑${formatTokens(usage.input)}`, `↓${formatTokens(usage.output)}`];
  statsParts.push("♻️", formatTokens(usage.cacheRead));
  const cost = payload?.cost?.total_cost_usd ?? 0;
  if (cost > 0) statsParts.push("💸", `$${cost.toFixed(3)}`);
  const statsLine = statsParts.join(" ");

  const timeTurnsLine = `⏰ ${formatElapsed(payload?.cost?.total_duration_ms ?? 0)} · 🔁 ${usage.turns}`;

  // Context progress bar — precalculated by Claude Code.
  const percent = payload?.context_window?.used_percentage ?? 0;
  const window = payload?.context_window?.context_window_size ?? 200_000;
  const segments = 16;
  const filled = Math.round((Math.max(0, Math.min(percent, 100)) / 100) * segments);
  const bar = "█".repeat(filled) + "░".repeat(segments - filled);
  let dotColor = GREEN;
  if (percent >= 85) dotColor = RED;
  else if (percent >= 60) dotColor = YELLOW;
  const progressLine = `${dotColor}●${RESET} ▕${bar}▏ ${percent.toFixed(1)}% / ${formatTokens(window)}`;

  // Left segments, followed directly by the progress bar. Right-alignment is
  // only attempted when the user pins an exact width via BONDHU_SL_WIDTH —
  // inferred widths (COLUMNS/stty) overshoot Claude Code's inset statusline
  // area and get the right side clipped.
  const parts = [modelLine, statsLine, timeTurnsLine];
  const width = Number(process.env.BONDHU_SL_WIDTH);
  debugLog("layout", { width, COLUMNS: process.env.COLUMNS, leftParts: parts, progress: progressLine });
  if (!Number.isFinite(width) || width < 40) {
    return ` ${GOLD}claude${RESET} ${parts.join("  |  ")}   ${progressLine}`;
  }

  // Claude Code clips the statusline slightly before the true terminal edge,
  // so reserve a few cells instead of padding to the full width.
  // Override with BONDHU_SL_SLACK=<cells> while iterating.
  const SLACK = Number(process.env.BONDHU_SL_SLACK) || 3;

  const budget = Math.max(0, width - SLACK - 2 - visibleWidth(progressLine));
  const kept = [];
  let used = 0;
  for (const part of parts) {
    const sepW = kept.length ? 5 : 0; // "  |  "
    const partW = visibleWidth(part);
    if (used + sepW + partW > budget) break;
    used += sepW + partW;
    kept.push(part);
  }
  // Keep leading segments while they fit; never overflow past the progress bar.
  let leftPlain = kept.length ? kept.join("  |  ") : truncateToWidth(parts[0], budget);
  leftPlain = truncateToWidth(leftPlain, budget);
  const pad = Math.max(1, width - SLACK - 7 - visibleWidth(leftPlain) - visibleWidth(progressLine));
  return ` ${GOLD}claude${RESET} ${leftPlain}${" ".repeat(pad)}${progressLine}`;
}

// --- main ---

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = "";
    const timer = setTimeout(() => resolve(data || "{}"), 2_000);
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => { clearTimeout(timer); resolve(data || "{}"); });
    process.stdin.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

const raw = await readStdin();
let payload = {};
try { payload = JSON.parse(raw); } catch { /* empty line below */ }

const transcriptPath = payload?.transcript_path;
const sessionId = payload?.session_id ?? "unknown";

if (transcriptPath) {
  const usage = sessionUsage(transcriptPath, sessionId);
  if (usage.cache) writeCache(sessionId, usage.cache);
  process.stdout.write(`${buildMinimalLine(payload, usage)}\n`);
} else {
  process.stdout.write(`${buildMinimalLine(payload, EMPTY_TOTALS)}\n`);
}
