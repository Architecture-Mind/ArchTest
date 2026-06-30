import type { LintResult } from "../linter/types"
import type { FuzzSummary } from "../fuzzer/types"
import type { ContractDiff } from "../snapshot/types"

export interface ReportData {
  generatedAt:   string
  projectRoot:   string
  framework?:    string
  routeCount:    number
  lint?:         { issues: LintResult[] }
  fuzz?:         FuzzSummary
  snapshot?:     ContractDiff
}

// ── HTML ──────────────────────────────────────────────────────────────────────

export function buildHtmlReport(data: ReportData): string {
  const { lint, fuzz, snapshot } = data

  const lintSection  = lint  ? renderLintHtml(lint.issues)   : ""
  const fuzzSection  = fuzz  ? renderFuzzHtml(fuzz)          : ""
  const snapSection  = snapshot ? renderSnapshotHtml(snapshot) : ""

  const lintCount   = lint?.issues.length ?? 0
  const crashCount  = fuzz?.crashes ?? 0
  const breakCount  = (snapshot?.removedRoutes.length ?? 0) +
                      (snapshot?.changedRoutes.filter(r => r.breaking).length ?? 0)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ArchTest Report — ${escHtml(data.projectRoot)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:system-ui,sans-serif;background:#0f1117;color:#e2e8f0;padding:2rem}
  h1{font-size:1.6rem;font-weight:700;margin-bottom:.25rem}
  h2{font-size:1.1rem;font-weight:600;margin:2rem 0 .75rem;border-bottom:1px solid #2d3748;padding-bottom:.4rem}
  .meta{color:#718096;font-size:.85rem;margin-bottom:2rem}
  .cards{display:flex;gap:1rem;margin-bottom:2rem;flex-wrap:wrap}
  .card{background:#1a202c;border-radius:8px;padding:1rem 1.5rem;min-width:140px}
  .card .val{font-size:2rem;font-weight:700}
  .card .lbl{font-size:.8rem;color:#718096;margin-top:.25rem}
  .red{color:#fc8181} .yellow{color:#f6e05e} .cyan{color:#76e4f7} .green{color:#68d391}
  table{width:100%;border-collapse:collapse;font-size:.88rem}
  th{text-align:left;padding:.5rem .75rem;color:#718096;font-weight:500;border-bottom:1px solid #2d3748}
  td{padding:.5rem .75rem;border-bottom:1px solid #1a202c;vertical-align:top}
  .badge{display:inline-block;padding:.15rem .5rem;border-radius:4px;font-size:.75rem;font-weight:600}
  .badge-high{background:#742a2a;color:#fc8181}
  .badge-warn{background:#744210;color:#f6e05e}
  .badge-info{background:#1a365d;color:#76e4f7}
  .badge-break{background:#742a2a;color:#fc8181}
  .badge-ok{background:#1c4532;color:#68d391}
  code{background:#2d3748;padding:.1rem .4rem;border-radius:3px;font-size:.85em}
  .empty{color:#4a5568;font-style:italic;padding:.75rem 0}
</style>
</head>
<body>
<h1>ArchTest Report</h1>
<p class="meta">Project: <code>${escHtml(data.projectRoot)}</code> &nbsp;·&nbsp; Generated: ${escHtml(data.generatedAt)}${data.framework ? ` &nbsp;·&nbsp; Framework: ${escHtml(data.framework)}` : ""} &nbsp;·&nbsp; Routes: ${data.routeCount}</p>

<div class="cards">
  <div class="card"><div class="val ${lintCount > 0 ? "red" : "green"}">${lintCount}</div><div class="lbl">Lint Issues</div></div>
  <div class="card"><div class="val ${crashCount > 0 ? "red" : "green"}">${crashCount}</div><div class="lbl">Fuzz Crashes</div></div>
  <div class="card"><div class="val ${breakCount > 0 ? "red" : "green"}">${breakCount}</div><div class="lbl">Breaking Changes</div></div>
  <div class="card"><div class="val">${data.routeCount}</div><div class="lbl">Routes Scanned</div></div>
</div>

${lintSection}
${fuzzSection}
${snapSection}
</body>
</html>`
}

function renderLintHtml(issues: LintResult[]): string {
  if (issues.length === 0) {
    return `<h2>Lint</h2><p class="empty">No issues found.</p>`
  }

  const rows = issues.map(r => {
    const badge = `<span class="badge badge-${r.severity}">${r.severity.toUpperCase()}</span>`
    const field = r.field ? ` <code>${escHtml(r.field)}</code>` : ""
    return `<tr><td>${badge}</td><td><code>${escHtml(r.code)}</code></td><td>${escHtml(r.route)}${field}</td><td>${escHtml(r.message)}</td></tr>`
  }).join("\n")

  return `<h2>Lint <span style="color:#718096;font-weight:400">(${issues.length})</span></h2>
<table><thead><tr><th>Severity</th><th>Rule</th><th>Route</th><th>Message</th></tr></thead>
<tbody>${rows}</tbody></table>`
}

function renderFuzzHtml(fuzz: FuzzSummary): string {
  const findings = fuzz.results.filter(r => r.status === "crash" || r.status === "unexpected_ok")

  const coverageRows = fuzz.fieldCoverage.map(fc => {
    const status = fc.crashes > 0
      ? `<span class="badge badge-high">${fc.crashes} crash</span>`
      : fc.bypasses > 0
        ? `<span class="badge badge-warn">${fc.bypasses} bypass</span>`
        : `<span class="badge badge-ok">clean</span>`
    return `<tr><td>${escHtml(fc.route)}</td><td><code>${escHtml(fc.field)}</code></td><td>${fc.totalPayloads}</td><td>${fc.categoriesFuzzed.length}</td><td>${status}</td></tr>`
  }).join("\n")

  const findingRows = findings.map(r => {
    const badge = r.status === "crash"
      ? `<span class="badge badge-high">CRASH ${r.actualStatus ?? ""}</span>`
      : `<span class="badge badge-warn">BYPASS ${r.actualStatus ?? ""}</span>`
    return `<tr><td>${badge}</td><td>${escHtml(r.fuzzCase.route)}</td><td><code>${escHtml(r.fuzzCase.fuzzField)}</code></td><td>${escHtml(r.fuzzCase.fuzzCategory)}</td></tr>`
  }).join("\n")

  return `<h2>Fuzz <span style="color:#718096;font-weight:400">(${fuzz.total} payloads · ${fuzz.crashes} crashes · ${fuzz.durationMs}ms)</span></h2>
${findings.length > 0
  ? `<table><thead><tr><th>Status</th><th>Route</th><th>Field</th><th>Category</th></tr></thead><tbody>${findingRows}</tbody></table>`
  : `<p class="empty">No crashes or bypasses found.</p>`}
${fuzz.fieldCoverage.length > 0
  ? `<h2 style="margin-top:1.5rem">Field Coverage</h2>
<table><thead><tr><th>Route</th><th>Field</th><th>Payloads</th><th>Categories</th><th>Result</th></tr></thead><tbody>${coverageRows}</tbody></table>`
  : ""}`
}

function renderSnapshotHtml(diff: ContractDiff): string {
  if (!diff.hasBreakingChanges && diff.addedRoutes.length === 0 && diff.changedRoutes.length === 0) {
    return `<h2>Snapshot Diff</h2><p class="empty">No contract changes detected.</p>`
  }

  const rows: string[] = []

  for (const r of diff.removedRoutes) {
    rows.push(`<tr><td><span class="badge badge-high">BREAKING</span></td><td>${escHtml(r)}</td><td>Route removed</td></tr>`)
  }
  for (const r of diff.addedRoutes) {
    rows.push(`<tr><td><span class="badge badge-ok">ADDED</span></td><td>${escHtml(r)}</td><td>New route</td></tr>`)
  }
  for (const rd of diff.changedRoutes) {
    const badge = rd.breaking
      ? `<span class="badge badge-break">BREAKING</span>`
      : `<span class="badge badge-warn">NON-BREAKING</span>`
    const changes = rd.changes.map(c => escHtml(c.kind)).join(", ")
    rows.push(`<tr><td>${badge}</td><td>${escHtml(rd.route)}</td><td>${changes}</td></tr>`)
  }

  return `<h2>Snapshot Diff</h2>
<table><thead><tr><th>Status</th><th>Route</th><th>Changes</th></tr></thead>
<tbody>${rows.join("\n")}</tbody></table>`
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ── Markdown ──────────────────────────────────────────────────────────────────

export function buildMarkdownReport(data: ReportData): string {
  const { lint, fuzz, snapshot } = data
  const lines: string[] = []

  lines.push(`# ArchTest Report`)
  lines.push(``)
  lines.push(`- **Project:** \`${data.projectRoot}\``)
  lines.push(`- **Generated:** ${data.generatedAt}`)
  if (data.framework) lines.push(`- **Framework:** ${data.framework}`)
  lines.push(`- **Routes:** ${data.routeCount}`)
  lines.push(``)

  // Summary
  const lintCount  = lint?.issues.length ?? 0
  const crashCount = fuzz?.crashes ?? 0
  const breakCount = (snapshot?.removedRoutes.length ?? 0) +
                     (snapshot?.changedRoutes.filter(r => r.breaking).length ?? 0)

  lines.push(`## Summary`)
  lines.push(``)
  lines.push(`| Check | Result |`)
  lines.push(`|---|---|`)
  lines.push(`| Lint issues | ${lintCount === 0 ? `✅ 0` : `❌ ${lintCount}`} |`)
  lines.push(`| Fuzz crashes | ${crashCount === 0 ? `✅ 0` : `❌ ${crashCount}`} |`)
  lines.push(`| Breaking changes | ${breakCount === 0 ? `✅ 0` : `❌ ${breakCount}`} |`)
  lines.push(`| Routes scanned | ${data.routeCount} |`)
  lines.push(``)

  if (lint) {
    lines.push(`## Lint`)
    lines.push(``)
    if (lint.issues.length === 0) {
      lines.push(`No issues found.`)
    } else {
      lines.push(`| Severity | Rule | Route | Message |`)
      lines.push(`|---|---|---|---|`)
      for (const r of lint.issues) {
        const field = r.field ? ` (field: \`${r.field}\`)` : ""
        lines.push(`| ${r.severity.toUpperCase()} | ${r.code} | \`${r.route}\`${field} | ${r.message} |`)
      }
    }
    lines.push(``)
  }

  if (fuzz) {
    lines.push(`## Fuzz`)
    lines.push(``)
    lines.push(`${fuzz.total} payloads · ${fuzz.crashes} crashes · ${fuzz.durationMs}ms`)
    lines.push(``)
    const findings = fuzz.results.filter(r => r.status === "crash" || r.status === "unexpected_ok")
    if (findings.length > 0) {
      lines.push(`| Status | Route | Field | Category |`)
      lines.push(`|---|---|---|---|`)
      for (const r of findings) {
        const label = r.status === "crash" ? `CRASH ${r.actualStatus ?? ""}` : `BYPASS ${r.actualStatus ?? ""}`
        lines.push(`| ${label} | \`${r.fuzzCase.route}\` | \`${r.fuzzCase.fuzzField}\` | ${r.fuzzCase.fuzzCategory} |`)
      }
    } else {
      lines.push(`No crashes or bypasses found.`)
    }
    lines.push(``)
    if (fuzz.fieldCoverage.length > 0) {
      lines.push(`### Field Coverage`)
      lines.push(``)
      lines.push(`| Route | Field | Payloads | Categories | Result |`)
      lines.push(`|---|---|---|---|---|`)
      for (const fc of fuzz.fieldCoverage) {
        const result = fc.crashes > 0 ? `${fc.crashes} crash` : fc.bypasses > 0 ? `${fc.bypasses} bypass` : "clean"
        lines.push(`| \`${fc.route}\` | \`${fc.field}\` | ${fc.totalPayloads} | ${fc.categoriesFuzzed.length} | ${result} |`)
      }
      lines.push(``)
    }
  }

  if (snapshot) {
    lines.push(`## Snapshot Diff`)
    lines.push(``)
    if (!snapshot.hasBreakingChanges && snapshot.addedRoutes.length === 0 && snapshot.changedRoutes.length === 0) {
      lines.push(`No contract changes detected.`)
    } else {
      for (const r of snapshot.removedRoutes) {
        lines.push(`- ❌ **BREAKING** ROUTE REMOVED \`${r}\``)
      }
      for (const r of snapshot.addedRoutes) {
        lines.push(`- ✅ ROUTE ADDED \`${r}\``)
      }
      for (const rd of snapshot.changedRoutes) {
        const label = rd.breaking ? "❌ **BREAKING**" : "⚠️ NON-BREAKING"
        lines.push(`- ${label} \`${rd.route}\` — ${rd.changes.map(c => c.kind).join(", ")}`)
      }
    }
    lines.push(``)
  }

  return lines.join("\n")
}
