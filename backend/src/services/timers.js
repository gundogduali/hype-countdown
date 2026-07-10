import { randomInt } from 'node:crypto';

export const CATEGORIES = ['games', 'sports', 'movies-tv', 'tech', 'holidays'];

const DEFAULT_EMOJI = '⏳';
// Ambiguous characters (0/o, 1/l etc.) are included, but that's fine —
// links are clicked, not typed by hand. 36^10 ≈ 3.6e15 possibilities: unguessable.
const SLUG_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SLUG_LENGTH = 10;
// target_at ceiling: at most +100 years from server time (rough leap-year math is fine).
const MAX_FUTURE_MS = 100 * 365.25 * 24 * 60 * 60_000;

/** Validation error: the route layer turns this into a 400. */
export class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** Cryptographically random, unguessable slug (for custom timers). */
export function randomSlug() {
  let s = '';
  for (let i = 0; i < SLUG_LENGTH; i++) {
    s += SLUG_ALPHABET[randomInt(SLUG_ALPHABET.length)];
  }
  return s;
}

// ISO 8601 with a mandatory timezone (Z or ±HH:MM). Timezone-less dates are
// rejected: "local or UTC?" ambiguity would lead to a wrong target moment.
const ISO_WITH_TZ = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

function rowToTimer(row) {
  return {
    slug: row.slug,
    title: row.title,
    emoji: row.emoji,
    category: row.category,
    target_at: row.target_at,
    is_curated: row.is_curated === 1,
    created_at: row.created_at,
  };
}

export class TimerService {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   * @param {() => Date} [now] injectable clock for testability
   */
  constructor(db, now = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  nowIso() {
    return this.now().toISOString();
  }

  /**
   * Curated, non-expired timers, nearest target first.
   * Custom timers (is_curated=0) are never returned.
   * @param {string} [category]
   */
  listCurated(category) {
    if (category !== undefined && category !== '' && !CATEGORIES.includes(category)) {
      throw new ValidationError(
        'invalid_category',
        `Invalid category. Valid values: ${CATEGORIES.join(', ')}.`
      );
    }
    const filter = category !== undefined && category !== '';
    const sql = `
      SELECT * FROM timers
      WHERE is_curated = 1 AND target_at > ?${filter ? ' AND category = ?' : ''}
      ORDER BY target_at ASC
    `;
    const args = filter ? [this.nowIso(), category] : [this.nowIso()];
    return this.db.prepare(sql).all(...args).map(rowToTimer);
  }

  /** Single timer by slug (curated or custom); null if missing. */
  getBySlug(slug) {
    const row = this.db.prepare('SELECT * FROM timers WHERE slug = ?').get(slug);
    return row ? rowToTimer(row) : null;
  }

  /**
   * Creates a custom timer. Throws ValidationError on validation failures.
   * @param {{title?: unknown, target_at?: unknown, emoji?: unknown, category?: unknown}} input
   */
  createCustom(input) {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      throw new ValidationError('invalid_body', 'Body must be a JSON object.');
    }
    const { title, target_at, emoji, category } = input;

    // title: string, 1–80 chars after trim
    if (typeof title !== 'string') {
      throw new ValidationError('invalid_title', 'Title is required and must be a string.');
    }
    const cleanTitle = title.trim();
    if (cleanTitle.length < 1 || cleanTitle.length > 80) {
      throw new ValidationError('invalid_title', 'Title must be 1–80 characters.');
    }

    // target_at: ISO 8601 with timezone, parseable, in the future
    if (typeof target_at !== 'string' || !ISO_WITH_TZ.test(target_at)) {
      throw new ValidationError(
        'invalid_target_at',
        'target_at must be ISO 8601 with a timezone (e.g. 2026-08-01T09:30:00+03:00).'
      );
    }
    const targetMs = Date.parse(target_at);
    if (Number.isNaN(targetMs)) {
      throw new ValidationError('invalid_target_at', 'target_at is not a valid date.');
    }
    if (targetMs <= this.now().getTime()) {
      throw new ValidationError('target_in_past', 'Target date must be in the future.');
    }
    if (targetMs > this.now().getTime() + MAX_FUTURE_MS) {
      throw new ValidationError(
        'invalid_target_at',
        'Target date can be at most 100 years in the future.'
      );
    }

    // emoji: optional, short string
    let cleanEmoji = DEFAULT_EMOJI;
    if (emoji !== undefined && emoji !== null) {
      if (typeof emoji !== 'string' || emoji.trim().length === 0 || emoji.length > 16) {
        throw new ValidationError('invalid_emoji', 'Emoji must be a short string.');
      }
      cleanEmoji = emoji.trim();
    }

    // category: optional, from the fixed list
    let cleanCategory = null;
    if (category !== undefined && category !== null && category !== '') {
      if (!CATEGORIES.includes(category)) {
        throw new ValidationError(
          'invalid_category',
          `Invalid category. Valid values: ${CATEGORIES.join(', ')}.`
        );
      }
      cleanCategory = category;
    }

    const insert = this.db.prepare(`
      INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
      VALUES (?, ?, ?, ?, ?, 0, ?)
    `);
    const createdAt = this.nowIso();
    const targetIso = new Date(targetMs).toISOString(); // normalize to UTC

    // Slug collisions are practically impossible, but retry on UNIQUE violation anyway.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = randomSlug();
      try {
        insert.run(slug, cleanTitle, cleanEmoji, cleanCategory, targetIso, createdAt);
        return this.getBySlug(slug);
      } catch (err) {
        if (!/UNIQUE/.test(String(err?.message))) throw err;
      }
    }
    throw new Error('Could not generate a slug (repeated collisions).');
  }
}
