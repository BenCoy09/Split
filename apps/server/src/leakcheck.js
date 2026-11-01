import { viewFor } from './roles.js';

const STOPWORDS = new Set([
  'item', 'line', 'lines', 'file', 'code', 'data', 'value', 'values',
]);

const KEYWORDS = new Set([
  'function', 'return', 'const', 'let', 'var', 'export', 'import', 'from',
  'if', 'else', 'for', 'while', 'true', 'false', 'null', 'undefined', 'new',
  'class', 'this', 'typeof', 'instanceof', 'await', 'async', 'try', 'catch',
]);

function normalize(text) {
  return String(text).toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wholeTokenRegex(token) {
  return new RegExp(`(?<![a-z0-9_])${escapeRe(token)}(?![a-z0-9_])`);
}

function codeTokens(contents) {
  const tokens = new Set();
  for (const chunk of contents) {
    const matches = String(chunk).match(/[a-z_][a-z0-9_]{2,}/gi) ?? [];
    for (const raw of matches) {
      const token = raw.toLowerCase();
      if (token.length >= 3 && !KEYWORDS.has(token)) tokens.add(token);
    }
  }
  return tokens;
}

function ownTokens(view) {
  const matches = normalize(JSON.stringify(view)).match(/[a-z_][a-z0-9_]{2,}/g) ?? [];
  return new Set(matches);
}

function leakyLines(text, minLength) {
  const lines = [];
  for (const raw of String(text).split('\n')) {
    const line = normalize(raw);
    if (line.length >= minLength) lines.push(line);
  }
  return lines;
}

function valueLeaks(answer, value) {
  const asString = String(value);
  if (/^-?[0-9.]+$/.test(asString)) {
    return wholeTokenRegex(asString.toLowerCase()).test(answer);
  }
  const asNorm = normalize(JSON.stringify(value));
  return asNorm.length >= 5 && answer.includes(asNorm);
}

export function findLeak(text, room, role) {
  const answer = normalize(text);
  if (!answer) return false;

  if (role === 'logs') {
    const own = ownTokens(viewFor(room, 'logs'));
    const contents = [
      ...room.source.map((file) => file.content),
      ...room.patches.filter((p) => p.diff).map((p) => p.diff),
    ];
    for (const token of codeTokens(contents)) {
      if (own.has(token) || STOPWORDS.has(token)) continue;
      if (wholeTokenRegex(token).test(answer)) return true;
    }
    const forbiddenLines = [
      ...contents.flatMap((content) => leakyLines(content, 10)),
      ...room.source.flatMap((file) => leakyLines(file.path, 4)),
    ];
    if (forbiddenLines.some((line) => answer.includes(line))) return true;
    return false;
  }

  if (role === 'source') {
    for (const log of room.logs) {
      const label = normalize(log.label);
      if (label && answer.includes(label)) return true;
      if (valueLeaks(answer, log.value)) return true;
    }
    const outputLines = leakyLines(room.testOutput, 10);
    if (outputLines.some((line) => answer.includes(line))) return true;
    return false;
  }

  return false;
}
