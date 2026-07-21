import { moderateText } from '../middleware/moderation.js';

/**
 * Hype Messages (PRD §9.3, issue HM-4): data access + moderation wiring for
 * short free-text messages attached to a timer.
 *
 * Cap choice: PRD §9.3 asks for a "capped list length" without a number. We
 * cap at 50 messages per timer — enough recent history to feel alive under a
 * popular timer without an unbounded GET response or unbounded storage
 * growth. The cap is enforced on BOTH sides: `list()` never returns more than
 * the cap, and `submit()` prunes anything beyond the cap for that timer after
 * every insert, so a timer's row count in storage never exceeds it either
 * (not just a read-time LIMIT clause).
 */
export const MESSAGE_CAP_PER_TIMER = 50;

function rowToMessage(row) {
  return { id: row.id, message: row.message, created_at: row.created_at };
}

export class MessageService {
  /**
   * @param {import('node:sqlite').DatabaseSync} db
   * @param {() => Date} [now] injectable clock for testability
   */
  constructor(db, now = () => new Date()) {
    this.db = db;
    this.now = now;
  }

  /**
   * Stored messages for a timer, newest first, capped.
   * @param {string} slug must already be known to exist (caller checks 404)
   * @param {number} [limit]
   * @returns {{ id: number, message: string, created_at: string }[]}
   */
  list(slug, limit = MESSAGE_CAP_PER_TIMER) {
    const rows = this.db
      .prepare(
        'SELECT id, message, created_at FROM messages WHERE timer_slug = ? ORDER BY id DESC LIMIT ?'
      )
      .all(slug, limit);
    return rows.map(rowToMessage);
  }

  /**
   * Runs the raw text through HM-3's moderation middleware (length, blocklist,
   * spam-pattern, sanitize — never re-derived here) and, if accepted, stores
   * it and prunes anything beyond the per-timer cap.
   *
   * @param {string} slug must already be known to exist (caller checks 404)
   * @param {unknown} rawText
   * @returns {{ ok: true, item: { id: number, message: string, created_at: string } }
   *   | { ok: false, code: string, message: string }}
   */
  submit(slug, rawText) {
    const result = moderateText(rawText);
    if (!result.ok) {
      return result;
    }

    const createdAt = this.now().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const info = this.db
        .prepare('INSERT INTO messages (timer_slug, message, created_at) VALUES (?, ?, ?)')
        .run(slug, result.text, createdAt);
      // Keep only the newest MESSAGE_CAP_PER_TIMER rows for this timer.
      this.db
        .prepare(
          `DELETE FROM messages WHERE timer_slug = ? AND id NOT IN (
             SELECT id FROM messages WHERE timer_slug = ? ORDER BY id DESC LIMIT ?
           )`
        )
        .run(slug, slug, MESSAGE_CAP_PER_TIMER);
      this.db.exec('COMMIT');
      return {
        ok: true,
        item: { id: Number(info.lastInsertRowid), message: result.text, created_at: createdAt },
      };
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }
  }
}
