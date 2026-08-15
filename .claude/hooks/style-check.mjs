#!/usr/bin/env node
/**
 * The house style gate for the interim billing app.
 *
 * CLAUDE.md section 4 says this app must never look AI built, and bans the em
 * dash, the en dash and a list of marketing words. This repository has no style
 * checker in its lint step, so the rule was only ever enforced by attention.
 * Now it runs on every file written in a session.
 *
 * Two modes:
 *   node .claude/hooks/style-check.mjs FILE...   check the named files
 *   node .claude/hooks/style-check.mjs           read a Claude Code hook
 *                                                payload on stdin (PostToolUse)
 *
 * A line carrying "style-ok" is skipped, for deliberate exceptions such as
 * quoting a source document that uses a banned character.
 * Exit 2 in hook mode hands the failure back to Claude to fix.
 *
 * Kept in step with luma-erp/scripts/check-style.mjs. If one gains a rule, so
 * does the other, the same way money.ts and format.ts are kept in step.
 */
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..', '..');
const TEXT_EXT = /\.(md|mjs|cjs|js|jsx|ts|tsx|json|ya?ml|css|sql|txt)$/i;

const BANNED_CHARS = /[–—―]/;
const CHAR_NAMES = {
  '–': 'en dash',
  '—': 'em dash',
  '―': 'horizontal bar',
};
const BANNED_WORDS =
  /\b(seamless(?:ly)?|leverag(?:e[sd]?|ing)|delv(?:e[sd]?|ing)|robust(?:ly|ness)?|streamlin(?:e[sd]?|ing)|empower(?:s|ed|ing|ment)?|effortless(?:ly)?|cutting.edge|supercharg(?:e[sd]?|ing)|game.chang(?:er|ing)|revolutioniz(?:e[sd]?|ing))\b/i;

// A markdown table separator or a horizontal rule is not a double hyphen.
const RULE_LINE = /^[\s|:.-]+$/;
const DOUBLE_HYPHEN = /\w--|--\w|\s--\s/;

const SELF = resolve(import.meta.filename);

function check(file) {
  // This file holds the banned patterns, so it cannot pass its own gate.
  if (resolve(file) === SELF) return [];
  const problems = [];
  const lines = readFileSync(file, 'utf8').split('\n');
  // The double hyphen rule is about prose punctuation. In code it would flag
  // the decrement operator and every command line flag, so it applies to
  // markdown only.
  const prose = /\.md$/i.test(file);
  let inFence = false;

  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (line.includes('style-ok')) return;

    const chr = line.match(BANNED_CHARS);
    if (chr) problems.push(`${i + 1}: banned character (${CHAR_NAMES[chr[0]]})`);

    const word = line.match(BANNED_WORDS);
    if (word) problems.push(`${i + 1}: banned word ("${word[0]}")`);

    // A command line flag is not a punctuation mark, so code is exempt: a
    // fenced block, and an inline span such as `prisma generate --sql`.
    const bare = line.replace(/`[^`]*`/g, '');
    if (prose && !inFence && !RULE_LINE.test(bare) && DOUBLE_HYPHEN.test(bare)) {
      problems.push(`${i + 1}: double hyphen. Use a comma, a colon, or two sentences`);
    }
  });

  return problems;
}

function report(file, problems) {
  const rel = relative(ROOT, file) || file;
  return problems.map((p) => `${rel}:${p}`).join('\n');
}

const args = process.argv.slice(2);

if (args.length) {
  let failed = 0;
  for (const arg of args) {
    const abs = resolve(arg);
    if (!existsSync(abs) || !TEXT_EXT.test(abs)) continue;
    const problems = check(abs);
    if (problems.length) {
      console.error(report(abs, problems));
      failed += problems.length;
    }
  }
  if (failed) {
    console.error(`\nStyle check failed: ${failed} problem(s). See CLAUDE.md section 4, "Content and UI style".`);
    process.exit(1);
  }
  console.log('Style check passed.');
  process.exit(0);
}

// Hook mode.
let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  process.exit(0);
}

const filePath = payload?.tool_input?.file_path ?? '';
if (!filePath || !TEXT_EXT.test(filePath)) process.exit(0);

const abs = resolve(filePath);
const rel = relative(ROOT, abs);
if (rel.startsWith('..') || rel.split(sep).includes('node_modules')) process.exit(0);
if (!existsSync(abs)) process.exit(0);

const problems = check(abs);
if (!problems.length) process.exit(0);

process.stderr.write(
  `House style gate failed on ${rel}. Fix it now, in this file, before continuing.\n\n` +
    `${report(abs, problems)}\n\n` +
    `Rule: CLAUDE.md section 4, "Content and UI style". No em dashes, no en ` +
    `dashes, no marketing vocabulary. A deliberate exception carries a ` +
    `style-ok marker on the line.\n`,
);
process.exit(2);
