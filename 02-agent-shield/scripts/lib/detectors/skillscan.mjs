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

// Secret-shaped tokens, covering snake_case (env), camelCase (wallet.privateKey —
// the dominant ethers/viem form), abbreviations, and a raw 0x 32-byte key.
const KEY_TOKEN = '(?:PRIVATE_?KEY|PRIV_?KEY|privateKey|privKey|MNEMONIC|mnemonic|SECRET_?KEY|secretKey|SEED_?PHRASE|seedPhrase|0x[a-fA-F0-9]{64})';
// Outbound-transport tokens across JS, Python, Go, and shells.
const TRANSPORT = '(?:curl|wget|iwr|invoke-webrequest|fetch|axios|XMLHttpRequest|sendBeacon|WebSocket|new\\s+ws|https?:\\/\\/|wss?:\\/\\/|requests\\.(?:post|get|put)|urllib|httpx|http\\.client|net\\.connect|socket\\.)';

const RULES = [
  {
    id: 'key-exfiltration',
    severity: 'high',
    title: 'Private key flows toward a network call',
    // key token appearing near an outbound transport, either order
    pattern: new RegExp(`${TRANSPORT}[^\\n]{0,200}${KEY_TOKEN}|${KEY_TOKEN}[^\\n]{0,200}${TRANSPORT}`, 'i'),
  },
  {
    id: 'piped-installer',
    severity: 'high',
    title: 'Remote script piped into a shell',
    // allow sudo/env/args and process substitution between the fetch and the shell
    pattern: /(?:curl|wget|iwr|invoke-webrequest)[^\n]{0,200}(?:[|;]\s*(?:sudo\s+|env\s+\S+\s+)*(?:bash|sh|zsh|iex|powershell|python|node)|<\(\s*(?:curl|wget))|(?:source|eval|bash|sh|python\s+-c)\s*<?\(?\s*\$?\(?\s*(?:curl|wget)/i,
  },
  {
    id: 'obfuscated-eval',
    severity: 'high',
    title: 'Obfuscated / dynamic code execution',
    // base64→eval, OR eval/Function/exec on a non-literal (variable/expression) argument
    pattern: /(?:eval|exec|Function|iex)\s*\([^\n)]{0,120}(?:atob|base64|b64decode|frombase64string|fromCharCode|\\x[0-9a-f]{2})|(?:atob|b64decode|frombase64string)\s*\([^\n)]{0,120}\)[^\n]{0,40}(?:eval|exec)|new\s+Function\s*\(|Function\s*\(\s*['"][^'"]*['"]\s*\)\s*\(|\.then\s*\(\s*eval\s*\)/i,
  },
  {
    id: 'env-dump',
    severity: 'medium',
    title: 'Whole environment serialized (may leak keys)',
    pattern: /(?:JSON\.stringify|Object\.(?:entries|assign|keys)|\{\s*\.\.\.)\s*\(?\s*process\.env|printenv[^\n]{0,80}(?:curl|>|\|)|dict\(os\.environ\)|os\.environ\.copy/i,
  },
  {
    id: 'key-write-to-file',
    severity: 'medium',
    title: 'Private key written to disk',
    pattern: new RegExp(`(?:writeFileSync|writeFile|set-content|>>?\\s*\\S+\\.(?:txt|log|json))[^\\n]{0,120}${KEY_TOKEN}`, 'i'),
  },
];

// File-level taint: a file that BOTH reads a secret and makes an outbound call
// (even on different lines) is suspicious even if the line-proximity rule missed it.
const SECRET_READ = /process\.env\.[A-Z_]*(?:KEY|MNEMONIC|SECRET|SEED)|os\.environ\[?['"][A-Z_]*(?:KEY|MNEMONIC|SECRET)|\.privateKey\b|readFileSync\([^\n)]*\.(?:key|pem|secret)/i;
const OUTBOUND_CALL = new RegExp(TRANSPORT, 'i');

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

    // File-level taint: secret read AND outbound call in the same file, even on
    // different lines (catches the split-across-lines evasion the line rules miss).
    if (!RULES.some((r) => r.id === 'key-exfiltration' && r.pattern.test(content))
        && SECRET_READ.test(content) && OUTBOUND_CALL.test(content)) {
      findings.push(makeFinding('medium', 'File reads a secret and makes an outbound call',
        `${file} — a secret (key/mnemonic/env) and a network call co-occur in this file; verify the secret never leaves the machine.`));
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
