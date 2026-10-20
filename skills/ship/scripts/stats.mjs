#!/usr/bin/env node
// Aggregate ship metrics from finished features' records, and optionally
// Claude Code token usage per phase from session transcripts.
// Usage: node stats.mjs [--repo <key>] [--tokens] [--json]
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { pathToFileURL } from "node:url"

const sum = (values) => values.reduce((a, b) => a + b, 0)
const sumMap = (map = {}) => sum(Object.values(map))

const median = (values) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function loadFeatures(shipHome, repoKey) {
  const reposDir = join(shipHome, "repos")
  if (!existsSync(reposDir)) return []
  return readdirSync(reposDir)
    .filter((key) => !repoKey || key === repoKey)
    .flatMap((key) => {
      const dir = join(reposDir, key, "records")
      if (!existsSync(dir)) return []
      return readdirSync(dir)
        .filter((file) => file.endsWith(".metrics.json"))
        .map((file) => JSON.parse(readFileSync(join(dir, file), "utf8")))
    })
}

// Each phase runs from its timeline entry to the next one; the last entry (done) has no window.
// A phase can recur (review fixes go back to implementing), so callers accumulate per phase.
function phaseWindows(timeline) {
  return timeline.slice(0, -1).map(({ phase, at }, i) => ({
    phase,
    from: Date.parse(at),
    to: Date.parse(timeline[i + 1].at),
  }))
}

function phaseMinutes(timeline) {
  const minutes = {}
  for (const { phase, from, to } of phaseWindows(timeline)) {
    minutes[phase] = (minutes[phase] ?? 0) + (to - from) / 60000
  }
  return minutes
}

function summarize(feature) {
  const m = feature.metrics
  const rework = sumMap(m.rework_lines)
  return {
    feature: feature.feature,
    repo: feature.repo_key,
    completed: feature.completed,
    chunksPlanned: m.chunks_planned,
    chunksShipped: m.chunks_shipped,
    amendments: m.amendments,
    verifyFailures: sumMap(m.verify_failures),
    reworkLines: rework,
    reworkPerChunk: m.chunks_shipped ? rework / m.chunks_shipped : 0,
    userTurns: sumMap(m.user_turns),
    reviewFindings: m.review.findings,
    reviewAccepted: m.review.accepted,
    minutes: phaseMinutes(feature.timeline),
  }
}

function* transcriptFiles(dir, modifiedSince) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* transcriptFiles(path, modifiedSince)
    else if (entry.name.endsWith(".jsonl") && statSync(path).mtimeMs >= modifiedSince) yield path
  }
}

const inRepo = (cwd, root) => cwd === root || cwd?.startsWith(`${root}/`)

// Token usage per phase: assistant entries whose cwd is inside the repo and whose timestamp
// falls in a phase window. One API response is logged as several entries, so dedupe by requestId.
function tokensByPhase(feature, projectsDir) {
  const windows = phaseWindows(feature.timeline)
  if (!windows.length || !existsSync(projectsDir)) return {}
  const start = windows[0].from
  const end = windows.at(-1).to
  const seen = new Set()
  const totals = {}
  for (const file of transcriptFiles(projectsDir, start)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      if (!line.includes('"usage"')) continue
      let entry
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      const usage = entry.message?.usage
      if (entry.type !== "assistant" || !usage || !inRepo(entry.cwd, feature.repo_path)) continue
      const at = Date.parse(entry.timestamp)
      if (at < start || at >= end) continue
      const id = entry.requestId ?? entry.message.id
      if (seen.has(id)) continue
      seen.add(id)
      const { phase } = windows.find((w) => at >= w.from && at < w.to)
      const t = (totals[phase] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })
      t.input += usage.input_tokens ?? 0
      t.output += usage.output_tokens ?? 0
      t.cacheRead += usage.cache_read_input_tokens ?? 0
      t.cacheWrite += usage.cache_creation_input_tokens ?? 0
    }
  }
  return totals
}

const worst = (rows, key) => rows.reduce((a, b) => (b[key] > a[key] ? b : a))

function report(rows) {
  if (!rows.length) return { features: 0 }
  const phases = [...new Set(rows.flatMap((r) => Object.keys(r.minutes)))]
  const findings = sum(rows.map((r) => r.reviewFindings))
  return {
    features: rows.length,
    medianMinutes: Object.fromEntries(
      phases.map((p) => [p, median(rows.filter((r) => p in r.minutes).map((r) => r.minutes[p]))]),
    ),
    planAccuracy: sum(rows.map((r) => r.chunksPlanned)) / (sum(rows.map((r) => r.chunksShipped)) || 1),
    reviewAcceptance: findings ? sum(rows.map((r) => r.reviewAccepted)) / findings : null,
    worstRework: worst(rows, "reworkPerChunk"),
    worstVerify: worst(rows, "verifyFailures"),
    worstAmendments: worst(rows, "amendments"),
  }
}

const round = (n) => Math.round(n * 10) / 10
const pct = (n) => (n === null ? "n/a" : `${Math.round(n * 100)}%`)

function formatText(rows, summary) {
  if (!summary.features) return "No finished features yet: /ship writes metrics when a feature finishes."
  const lines = [`ship stats: ${summary.features} feature(s)`, ""]
  lines.push("feature | chunks plan→ship | amend | verify fails | rework/chunk | turns | review acc/found")
  for (const r of rows) {
    lines.push(
      `${r.feature} | ${r.chunksPlanned}→${r.chunksShipped} | ${r.amendments} | ${r.verifyFailures} | ${round(r.reworkPerChunk)} | ${r.userTurns} | ${r.reviewAccepted}/${r.reviewFindings}`,
    )
  }
  lines.push("", "Median minutes per phase: " + Object.entries(summary.medianMinutes).map(([p, m]) => `${p} ${round(m)}`).join(" · "))
  const tokenRows = rows.filter((r) => r.tokens && Object.keys(r.tokens).length)
  for (const r of tokenRows) {
    const parts = Object.entries(r.tokens).map(([p, t]) => `${p} ${t.input + t.cacheRead + t.cacheWrite} in / ${t.output} out`)
    lines.push(`Tokens ${r.feature}: ${parts.join(" · ")}`)
  }
  lines.push(
    "",
    "Signals",
    `- Planned chunks per shipped chunk: ${round(summary.planAccuracy)} (below 1: plans miss work)`,
    `- Review acceptance: ${pct(summary.reviewAcceptance)} (low: reviewer noise; high: chunks leave quality on the table)`,
    `- Most rework per chunk: ${summary.worstRework.feature} (${round(summary.worstRework.reworkPerChunk)} lines)`,
    `- Most verify failures: ${summary.worstVerify.feature} (${summary.worstVerify.verifyFailures})`,
    `- Most amendments: ${summary.worstAmendments.feature} (${summary.worstAmendments.amendments})`,
  )
  return lines.join("\n")
}

function main(args) {
  const flag = (name) => args.includes(name)
  const repoIndex = args.indexOf("--repo")
  const repoKey = repoIndex >= 0 ? args[repoIndex + 1] : undefined
  const shipHome = process.env.SHIP_HOME || join(homedir(), ".agents", "ship")
  const projectsDir = process.env.CLAUDE_PROJECTS_DIR || join(homedir(), ".claude", "projects")

  const features = loadFeatures(shipHome, repoKey).sort((a, b) => a.completed.localeCompare(b.completed))
  const rows = features.map((f) => ({
    ...summarize(f),
    ...(flag("--tokens") && { tokens: tokensByPhase(f, projectsDir) }),
  }))
  const summary = report(rows)
  console.log(flag("--json") ? JSON.stringify({ summary, features: rows }, null, 2) : formatText(rows, summary))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2))
