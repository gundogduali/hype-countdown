/**
 * Content-safety layer for short user-submitted free text (Hype Messages, PRD §9.3,
 * issue HM-3). Pure, dependency-free (besides node:fs for config loading) and
 * independently testable — no Express/route/DB coupling required to exercise it.
 *
 * Consumers (e.g. HM-4's `POST /api/timers/:slug/message` route):
 *
 *   import { moderateText, moderationMiddleware } from '../middleware/moderation.js';
 *
 *   // 1) As a plain function (synchronous, no req/res needed):
 *   const result = moderateText(body.text);
 *   if (!result.ok) return res.status(400).json({ error: { code: result.code, message: result.message } });
 *   const sanitized = result.text; // store this, not the raw input
 *
 *   // 2) As Express middleware, composed directly into a route:
 *   router.post('/:slug/message', moderationMiddleware(), (req, res) => {
 *     // req.body.text has been replaced with the sanitized, accepted text.
 *     ...
 *   });
 *
 * Return shape of `moderateText` / what `moderationMiddleware` responds with on rejection:
 *   ok path:   { ok: true, text: string }               // text is sanitized + trimmed
 *   fail path: { ok: false, code: string, message: string }
 *
 * See docs/api.md ("Hype Messages — Moderation Layer (HM-3)") for the stable error
 * `code` contract. Rate limiting per submitter is deliberately NOT implemented here:
 * PRD §9.3 and this issue's task both describe it as a separate concern layered on
 * top by HM-4 ("beyond the moderation layer's own checks"), reusing the project's
 * existing per-IP rate-limit convention (backend/src/services/rate-limit.js). This
 * module does include an optional, self-contained `createDuplicateGuard` helper for
 * flooding a timer with the exact same message repeatedly, since that's a stateless,
 * in-memory concern with the same shape as this module's other checks — it's opt-in
 * and not wired into `moderateText`/`moderationMiddleware` by default.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadJsonConfig(fileName) {
  const full = path.join(__dirname, '..', 'config', fileName);
  return JSON.parse(fs.readFileSync(full, 'utf8'));
}

const wordlistConfig = loadJsonConfig('wordlist.json');
const moderationConfig = loadJsonConfig('moderation.json');

/** Config-driven defaults, loaded once at module load from backend/src/config/*.json. */
export const DEFAULT_MAX_LENGTH = moderationConfig.maxLength;
export const DEFAULT_REPEATED_CHAR_MIN_RUN = moderationConfig.repeatedCharMinRun;
export const DEFAULT_URL_TLDS = moderationConfig.urlTlds;
export const DEFAULT_BLOCKLIST = wordlistConfig.blocklist;

// ---------------------------------------------------------------------------
// Normalization helpers (shared by the blocklist and URL checks so both can
// be evaded-tested the same way: case, unicode look-alikes, zero-width chars).
// ---------------------------------------------------------------------------

const ZERO_WIDTH_RE = /[​-‍﻿⁠]/g;

/**
 * Normalizes text for *detection only* (never used for the stored/sanitized
 * text): NFKC-folds unicode look-alikes (fullwidth forms, some ligatures) to
 * their plain-ASCII equivalents, strips zero-width characters sometimes used
 * to split up blocked words/URLs, and lowercases.
 */
export function normalizeForDetection(text) {
  return text.normalize('NFKC').replace(ZERO_WIDTH_RE, '').toLowerCase();
}

/** Common leetspeak substitutions, applied only for blocklist matching. */
const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '$': 's', '@': 'a' };

function deleetForBlocklist(text) {
  return text.replace(/[013457$@]/g, (ch) => LEET_MAP[ch] ?? ch);
}

// ---------------------------------------------------------------------------
// 1. Max length + empty/whitespace-only check
// ---------------------------------------------------------------------------

/**
 * @param {string} trimmedText already-trimmed text
 * @param {number} maxLength config-driven max length (default: DEFAULT_MAX_LENGTH)
 * @returns {{code: string, message: string} | null}
 */
export function checkLength(trimmedText, maxLength = DEFAULT_MAX_LENGTH) {
  if (trimmedText.length === 0) {
    return { code: 'invalid_message', message: 'Message cannot be empty.' };
  }
  if (trimmedText.length > maxLength) {
    return {
      code: 'message_too_long',
      message: `Message must be ${maxLength} characters or fewer.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Blocklist / wordlist check
// ---------------------------------------------------------------------------

/**
 * @param {string} trimmedText
 * @param {string[]} blocklist config-driven list of blocked terms (default: DEFAULT_BLOCKLIST)
 * @returns {{code: string, message: string} | null}
 */
export function checkBlocklist(trimmedText, blocklist = DEFAULT_BLOCKLIST) {
  const normalized = deleetForBlocklist(normalizeForDetection(trimmedText));
  for (const term of blocklist) {
    const normalizedTerm = deleetForBlocklist(normalizeForDetection(term));
    if (!normalizedTerm) continue;
    // \b anchors only the two ends of the whole term (word/non-word transition),
    // which works correctly for both single words ("shit" but not "shitake")
    // and phrases ("dm me" but not "dm meet" — the position right after "me"
    // inside "meet" is word-to-word, so \b correctly does NOT match there).
    const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`);
    if (re.test(normalized)) {
      return {
        code: 'message_blocked_content',
        message: 'Message contains blocked content.',
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3a. Spam pattern: repeated-character flooding ("aaaaaaaaaa")
// ---------------------------------------------------------------------------

/**
 * @param {string} trimmedText
 * @param {number} minRun trigger threshold (default: DEFAULT_REPEATED_CHAR_MIN_RUN)
 * @returns {{code: string, message: string} | null}
 */
export function checkRepeatedCharFlood(trimmedText, minRun = DEFAULT_REPEATED_CHAR_MIN_RUN) {
  // Lowercased so alternating-case flooding ("AaAaAaAaAa") is still caught.
  const lowered = trimmedText.toLowerCase();
  const re = new RegExp(`(.)\\1{${minRun - 1},}`, 'u');
  if (re.test(lowered)) {
    return {
      code: 'message_repeated_chars',
      message: 'Message looks like spam (a character repeated too many times).',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3b. Spam pattern: bare URLs/links
// ---------------------------------------------------------------------------

/** Collapses "dot"/"[dot]"/"(dot)" spelled-out evasions into a literal ".", keeping other whitespace intact. */
function collapseDotEvasions(normalizedText) {
  return normalizedText.replace(/\s*[[(]?\bdot\b[)\]]?\s*/g, '.'); // " dot ", "[dot]", "(dot)" -> "."
}

/**
 * HM-3b (2026-07-20, code-reviewer finding + PM decision): the bare `word.tld`
 * heuristic below only fires for `tlds` that are NOT also common English
 * words/abbreviations. Casual messages routinely join two clauses with a
 * period and no following space ("so hyped for this game.gg", "live.to be
 * honest", "this is lit.club vibes") — if the TLD list contains ordinary
 * words (gg, co, to, me, tv, club, biz, dev, shop, top, win, click, ...),
 * those innocent phrases get wrongly flagged as links. Precision-over-recall
 * trade-off (accepted, not a bug): `DEFAULT_URL_TLDS` (backend/src/config/
 * moderation.json) intentionally excludes those ambiguous TLDs, so a real
 * spam link using one of them (e.g. "spam.gg") is NOT caught by this bare-
 * domain check alone — only by an explicit `http(s)://`/`www.` scheme, or by
 * the length/blocklist checks independently. See
 * docs/api.md ("Hype Messages — Moderation Layer") for the full trade-off
 * writeup alongside the other three (Cyrillic homoglyphs not caught,
 * plain-space-split domains without a "dot"/scheme marker not caught, 6+
 * identical emoji flagged as flood).
 *
 * @param {string} trimmedText
 * @param {string[]} tlds config-driven TLD list (default: DEFAULT_URL_TLDS) —
 *   keep this restricted to unambiguous TLDs only (see moderation.json's
 *   `_urlTldsReadme`); do not add common English words/abbreviations back in.
 * @returns {{code: string, message: string} | null}
 */
export function checkBareUrl(trimmedText, tlds = DEFAULT_URL_TLDS) {
  const normalized = normalizeForDetection(trimmedText);
  const dotCollapsed = collapseDotEvasions(normalized);
  // Fully whitespace-stripped variant catches schemes/hosts split across spaces
  // ("h t t p s : / / e v i l . c o m"); word boundaries would be meaningless
  // here since everything is glued together, so scheme/host prefixes are enough.
  const fullyCompact = dotCollapsed.replace(/\s+/g, '');
  if (/https?:\/\//.test(fullyCompact) || /www\./.test(fullyCompact)) {
    return {
      code: 'message_contains_link',
      message: 'Message cannot contain links or URLs.',
    };
  }

  // Bare "word.tld" domain pattern: checked against the dot-collapsed-but-
  // whitespace-preserved text so word boundaries around the domain stay
  // meaningful (surrounding words don't get glued to it).
  const tldPattern = tlds.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const domainRe = new RegExp(`\\b[a-z0-9-]{2,63}\\.(?:${tldPattern})\\b`);
  if (domainRe.test(dotCollapsed)) {
    return {
      code: 'message_contains_link',
      message: 'Message cannot contain links or URLs.',
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// 4. Sanitization (defense in depth — assume the frontend renders this raw)
// ---------------------------------------------------------------------------

const HTML_ESCAPE_MAP = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
  '`': '&#96;',
};

/**
 * Strips control characters (including newlines/tabs — this is meant to be a
 * short single-line message) and HTML-escapes anything that could act as
 * markup/script if the frontend interpolates it into HTML without its own
 * escaping. Idempotent-ish: escaping already-escaped text just double-escapes
 * ampersands, which is safe (never re-introduces a raw `<`/`>`).
 * @param {string} trimmedText
 * @returns {string}
 */
export function sanitizeText(trimmedText) {
  const noControlChars = trimmedText
    // eslint-disable-next-line no-control-regex
    .replace(/[ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return noControlChars.replace(/[&<>"'`]/g, (ch) => HTML_ESCAPE_MAP[ch]);
}

// ---------------------------------------------------------------------------
// Orchestration: runs every check, in order, short-circuiting on first failure.
// ---------------------------------------------------------------------------

/**
 * @typedef {{ maxLength?: number, blocklist?: string[], repeatedCharMinRun?: number, urlTlds?: string[] }} ModerationConfig
 */

/**
 * @param {unknown} rawText
 * @param {ModerationConfig} [config]
 * @returns {{ok: true, text: string} | {ok: false, code: string, message: string}}
 */
export function moderateText(rawText, config = {}) {
  const {
    maxLength = DEFAULT_MAX_LENGTH,
    blocklist = DEFAULT_BLOCKLIST,
    repeatedCharMinRun = DEFAULT_REPEATED_CHAR_MIN_RUN,
    urlTlds = DEFAULT_URL_TLDS,
  } = config;

  if (typeof rawText !== 'string') {
    return { ok: false, code: 'invalid_message', message: 'Message is required and must be a string.' };
  }

  const trimmed = rawText.trim();

  const lengthError = checkLength(trimmed, maxLength);
  if (lengthError) return { ok: false, ...lengthError };

  const repeatedCharError = checkRepeatedCharFlood(trimmed, repeatedCharMinRun);
  if (repeatedCharError) return { ok: false, ...repeatedCharError };

  const urlError = checkBareUrl(trimmed, urlTlds);
  if (urlError) return { ok: false, ...urlError };

  const blocklistError = checkBlocklist(trimmed, blocklist);
  if (blocklistError) return { ok: false, ...blocklistError };

  return { ok: true, text: sanitizeText(trimmed) };
}

/**
 * Express middleware factory. Reads `req.body[field]`, runs `moderateText`,
 * and either replaces `req.body[field]` with the sanitized/accepted text and
 * calls `next()`, or responds `400 { error: { code, message } }` directly
 * (matching the project's existing error body shape, docs/api.md).
 *
 * @param {{ field?: string, config?: ModerationConfig }} [options]
 * @returns {import('express').RequestHandler}
 */
export function moderationMiddleware({ field = 'text', config = {} } = {}) {
  return function moderationCheck(req, res, next) {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const result = moderateText(body[field], config);
    if (!result.ok) {
      return res.status(400).json({ error: { code: result.code, message: result.message } });
    }
    req.body[field] = result.text;
    next();
  };
}

// ---------------------------------------------------------------------------
// Optional bonus utility: in-memory duplicate-submission guard.
//
// Not wired into moderateText/moderationMiddleware by default (this issue's
// task description scopes HM-3 to length/blocklist/spam-pattern/sanitize; see
// module docstring). Provided because "repeated identical submissions" is
// listed as a spam signal in this agent's general rules, and — like
// backend/src/services/rate-limit.js — it can be implemented as a stateless,
// in-memory, DB-free helper that HM-4 can opt into per submitter key
// (IP and/or device token, whatever identity signal that issue settles on).
// ---------------------------------------------------------------------------

/**
 * @param {{ windowMs?: number, now?: () => Date }} [options]
 * @returns {(key: string, text: string) => boolean} true if `text` is an exact
 *   repeat of that same key's last submission within `windowMs`.
 */
export function createDuplicateGuard({ windowMs = 60_000, now = () => new Date() } = {}) {
  /** @type {Map<string, { text: string, t: number }>} */
  const lastByKey = new Map();

  return function isDuplicateSubmission(key, text) {
    const t = now().getTime();
    const prev = lastByKey.get(key);
    lastByKey.set(key, { text, t });
    if (!prev) return false;
    if (t - prev.t > windowMs) return false;
    return prev.text === text;
  };
}
