// Detector 4: static scan of a third-party skill (SKILL.md + scripts) for
// the patterns CertiK's scanner targets: key exfiltration, piped installers,
// obfuscated eval, undeclared network endpoints.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { makeFinding } from '../report.mjs';

const SCANNABLE_EXT = new Set(['.md', '.mjs', '.js', '.cjs', '.ts', '.mts', '.py', '.sh', '.ps1', '.json', '.yaml', '.yml', '.txt']);
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__']);

// Hosts a Pharos skill legitimately talks to.
const DEFAULT_ALLOWED_HOSTS = [
  'atlantic.dplabs-internal.com',
  'rpc.pharos.xyz',
  'atlantic.pharosscan.xyz',
  'www.pharosscan.xyz',
  'pharosscan.xyz',
  'docs.pharos.xyz',
  'docs.pharosnetwork.xyz',
  'flow.anvita.xyz',
  'github.com',
  'raw.githubusercontent.com',
  'localhost',
  '127.0.0.1',
];

const KEY_TOKEN = '(?:PRIVATE_KEY|MNEMONIC|SECRET_KEY|SEED_PHRASE)';

const RULES = [
  {
    id: 'key-exfiltration',
    severity: 'high',
    title: 'Private key flows toward a network call',
    // key env var appearing inside/near an outbound call or URL
    pattern: new RegExp(`(?:curl|wget|fetch|axios|https?://)[^\\n]{0,160}${KEY_TOKEN}|${KEY_TOKEN}[^\\n]{0,160}https?://`, 'i'),
  },
  {
    id: 'piped-installer',
    severity: 'high',
    title: 'Remote script piped into a shell',
    pattern: /(?:curl|wget|iwr|invoke-webrequest)[^\n|;]{0,200}[|;]\s*(?:bash|sh|zsh|iex|powershell)/i,
  },
  {
    id: 'obfuscated-eval',
    severity: 'high',
    title: 'Obfuscated code execution (base64 → eval/exec)',
    pattern: /(?:eval|exec|Function|iex)\s*\([^\n)]{0,120}(?:atob|base64|b64decode|frombase64string)|(?:atob|b64decode|frombase64string)\s*\([^\n)]{0,120}\)[^\n]{0,40}(?:eval|exec)/i,
  },
  {
    id: 'env-dump',
    severity: 'medium',
    title: 'Whole environment serialized (may leak keys)',
    pattern: /JSON\.stringify\s*\(\s*process\.env\s*\)|printenv[^\n]{0,80}(?:curl|>|\|)|dict\(os\.environ\)/i,
  },
  {
    id: 'key-write-to-file',
    severity: 'medium',
    title: 'Private key written to disk',
    pattern: new RegExp(`(?:writeFileSync|writeFile|set-content|>>?\\s*\\S+\\.(?:txt|log|json))[^\\n]{0,120}${KEY_TOKEN}`, 'i'),
  },
];

function* walkFiles(root) {
  const st = statSync(root);
  if (st.isFile()) { yield root; return; }
  for (const entry of readdirSync(root)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(root, entry);
    const s = statSync(full);
    if (s.isDirectory()) yield* walkFiles(full);
    else if (SCANNABLE_EXT.has(extname(entry).toLowerCase()) || basename(entry) === 'SKILL.md') yield full;
  }
}

function lineOf(content, index) {
  return content.slice(0, index).split('\n').length;
}

function extractHosts(content) {
  const hosts = new Set();
  for (const m of content.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) {
    hosts.add(m[1].toLowerCase().replace(/[.-]+$/, ''));
  }
  return hosts;
}

export function scanSkill(path, { allowedHosts = [] } = {}) {
  const findings = [];
  const allowed = new Set([...DEFAULT_ALLOWED_HOSTS, ...allowedHosts].map((h) => h.toLowerCase()));
  const unknownHosts = new Map(); // host -> first "file:line"
  let filesScanned = 0;

  for (const file of walkFiles(path)) {
    filesScanned++;
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }

    for (const rule of RULES) {
      const m = rule.pattern.exec(content);
      if (m) {
        findings.push(makeFinding(rule.severity, rule.title,
          `${file}:${lineOf(content, m.index)} — ${m[0].slice(0, 120).replace(/\s+/g, ' ')}`));
      }
    }

    for (const host of extractHosts(content)) {
      const isAllowed = [...allowed].some((a) => host === a || host.endsWith('.' + a));
      if (!isAllowed && !unknownHosts.has(host)) {
        const idx = content.toLowerCase().indexOf(host);
        unknownHosts.set(host, `${file}:${lineOf(content, idx)}`);
      }
    }
  }

  for (const [host, where] of unknownHosts) {
    findings.push(makeFinding('low', 'Undeclared external endpoint',
      `${host} (first seen ${where}) is not on the known-hosts allowlist — verify why this skill talks to it.`));
  }

  findings.push(makeFinding('info', 'Scan coverage', `${filesScanned} file(s) scanned under ${path}.`));
  return findings;
}
