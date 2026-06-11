// Findings -> score -> verdict aggregation, mirroring CertiK-style grading.

const DEFAULT_WEIGHTS = { high: 40, medium: 20, low: 10, info: 0 };

export function makeFinding(severity, title, detail) {
  if (!(severity in DEFAULT_WEIGHTS)) throw new Error(`bad severity: ${severity}`);
  return { severity, title, detail };
}

export function aggregate(findings, weights = DEFAULT_WEIGHTS) {
  let score = 100;
  for (const f of findings) score -= weights[f.severity] ?? 0;
  score = Math.max(0, score);

  const hasHigh = findings.some((f) => f.severity === 'high');
  const hasMedium = findings.some((f) => f.severity === 'medium');
  const hasLow = findings.some((f) => f.severity === 'low');

  let verdict = 'pass';
  if (hasHigh || score < 50) verdict = 'fail';
  else if (hasMedium || hasLow || score < 80) verdict = 'warn';

  const recommendation =
    verdict === 'fail' ? 'do-not-sign'
    : verdict === 'warn' ? 'confirm-required'
    : 'ok-to-sign';

  return { verdict, score, recommendation, findings };
}

export function render(report, { json = false } = {}) {
  if (json) return JSON.stringify(report, null, 2);
  const lines = [
    `verdict: ${report.verdict}`,
    `score: ${report.score}`,
    'findings:',
  ];
  if (report.findings.length === 0) lines.push('  (none)');
  for (const f of report.findings) {
    lines.push(`  - severity: ${f.severity}`);
    lines.push(`    title: ${f.title}`);
    if (f.detail) lines.push(`    detail: ${f.detail}`);
  }
  lines.push(`recommendation: ${report.recommendation}`);
  return lines.join('\n');
}

// Process exit codes: 0 pass, 1 warn, 2 fail — so agents can gate on $?.
export function exitCode(report) {
  return report.verdict === 'pass' ? 0 : report.verdict === 'warn' ? 1 : 2;
}
