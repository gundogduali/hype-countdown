import { ValidationError } from './timers.js';

/** Fixed emoji set for Hype Reactions (PRD §9.2). No other emoji is accepted. */
export const REACTION_EMOJI = ['🔥', '⏳', '🎉', '😱', '👀'];

export class ReactionService {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   * @param {() => Date} [now] injectable clock for testability
   */
  constructor(db, now = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /**
   * Reaction counts for a timer, one key per fixed emoji, 0 for unused ones.
   * @param {string} slug
   * @returns {Record<string, number>}
   */
  getCounts(slug) {
    const counts = Object.fromEntries(REACTION_EMOJI.map((e) => [e, 0]));
    const rows = this.db
      .prepare('SELECT emoji, count FROM reaction_totals WHERE timer_slug = ?')
      .all(slug);
    for (const row of rows) {
      if (row.emoji in counts) counts[row.emoji] = row.count;
    }
    return counts;
  }

  /**
   * Records an anonymous reaction. Idempotent per (slug, emoji, ip): a repeat
   * from the same IP does not increment the count again.
   *
   * Race-safety note: node:sqlite's DatabaseSync is synchronous, so within a
   * single process there is no interleaving between requests anyway. The
   * INSERT into reaction_marks still goes through its PRIMARY KEY (a real
   * DB-level uniqueness constraint, not an app-level SELECT-before-INSERT),
   * wrapped in an immediate transaction, so the guarantee holds even if this
   * ever runs against a shared DB file from more than one process.
   *
   * @param {string} slug must already be known to exist (caller checks 404)
   * @param {unknown} emoji
   * @param {string} ip
   * @returns {{ added: boolean, reactions: Record<string, number> }}
   */
  react(slug, emoji, ip) {
    if (typeof emoji !== 'string' || !REACTION_EMOJI.includes(emoji)) {
      throw new ValidationError(
        'invalid_reaction_emoji',
        `Emoji must be one of: ${REACTION_EMOJI.join(' ')}.`
      );
    }

    const insertMark = this.db.prepare(
      'INSERT INTO reaction_marks (timer_slug, emoji, ip, created_at) VALUES (?, ?, ?, ?)'
    );
    const upsertTotal = this.db.prepare(`
      INSERT INTO reaction_totals (timer_slug, emoji, count) VALUES (?, ?, 1)
      ON CONFLICT (timer_slug, emoji) DO UPDATE SET count = count + 1
    `);

    let added = false;
    this.db.exec('BEGIN IMMEDIATE');
    try {
      insertMark.run(slug, emoji, ip, this.now().toISOString());
      upsertTotal.run(slug, emoji);
      added = true;
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      // Duplicate (slug, emoji, ip): already reacted — no-op, not an error.
      if (!/UNIQUE/.test(String(err?.message))) throw err;
    }

    return { added, reactions: this.getCounts(slug) };
  }
}
