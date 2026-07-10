/**
 * Curated seed list — source: docs/PRD.md Appendix A (v2.1, English).
 * Dates were verified by the PM against web sources on 2026-07-09.
 * The seed is an upsert, so corrections here reach the DB on restart.
 * v2.1: titles, slugs and categories switched to English; New Year target
 * moved to UTC midnight (product is global now).
 */
export const CURATED_TIMERS = [
  { slug: 'gta-6',                    title: 'GTA 6 Release',                       category: 'games',     emoji: '🎮', target_at: '2026-11-19T00:00:00.000Z' },
  { slug: 'world-cup-2026-final',     title: 'FIFA World Cup 2026 Final',           category: 'sports',    emoji: '🏆', target_at: '2026-07-19T19:00:00.000Z' },
  { slug: 'spider-man-brand-new-day', title: 'Spider-Man: Brand New Day',           category: 'movies-tv', emoji: '🕷️', target_at: '2026-07-31T00:00:00.000Z' },
  { slug: 'avengers-doomsday',        title: 'Avengers: Doomsday',                  category: 'movies-tv', emoji: '🦸', target_at: '2026-12-18T00:00:00.000Z' },
  { slug: 'dune-part-three',          title: 'Dune: Part Three',                    category: 'movies-tv', emoji: '🏜️', target_at: '2026-12-18T00:00:00.000Z' },
  { slug: 'iphone-18-event',          title: 'iPhone 18 Event (expected)',          category: 'tech',      emoji: '📱', target_at: '2026-09-08T17:00:00.000Z' },
  { slug: 'black-friday-2026',        title: 'Black Friday',                        category: 'holidays',  emoji: '🛍️', target_at: '2026-11-27T00:00:00.000Z' },
  { slug: 'halloween-2026',           title: 'Halloween',                           category: 'holidays',  emoji: '🎃', target_at: '2026-10-31T00:00:00.000Z' },
  { slug: 'christmas-2026',           title: 'Christmas',                           category: 'holidays',  emoji: '🎄', target_at: '2026-12-25T00:00:00.000Z' },
  { slug: 'new-year-2027',            title: 'New Year 2027',                       category: 'holidays',  emoji: '🎆', target_at: '2027-01-01T00:00:00.000Z' },
  { slug: 'valentines-day-2027',      title: "Valentine's Day",                     category: 'holidays',  emoji: '💘', target_at: '2027-02-14T00:00:00.000Z' },
  { slug: 'super-bowl-lxi',           title: 'Super Bowl LXI',                      category: 'sports',    emoji: '🏈', target_at: '2027-02-14T23:30:00.000Z' },
  { slug: 'eurovision-2027-final',    title: 'Eurovision 2027 Grand Final',         category: 'holidays',  emoji: '🎤', target_at: '2027-05-26T19:00:00.000Z' },
  { slug: 'ucl-final-2027',           title: 'UEFA Champions League Final 2027',    category: 'sports',    emoji: '⚽', target_at: '2027-06-05T19:00:00.000Z' },
  { slug: 'zelda-movie',              title: 'The Legend of Zelda Movie',           category: 'movies-tv', emoji: '🗡️', target_at: '2027-04-30T00:00:00.000Z' },
  { slug: 'womens-world-cup-2027',    title: "FIFA Women's World Cup 2027 Opening", category: 'sports',    emoji: '⚽', target_at: '2027-06-24T00:00:00.000Z' },
  { slug: 'la-2028-olympics',         title: 'LA 2028 Olympics Opening Ceremony',   category: 'sports',    emoji: '🥇', target_at: '2028-07-14T00:00:00.000Z' },
];

/**
 * Idempotent seed: upsert keyed by slug. Re-running never duplicates rows;
 * title/date corrections in the list reach existing rows. Curated rows whose
 * slug is no longer in the list are deleted (cleans obsolete slugs — e.g. the
 * pre-v2.1 Turkish ones — and future curation removals). Only touches curated
 * rows; custom timers (is_curated = 0) are never modified or deleted.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {() => Date} now
 */
export function seedCuratedTimers(db, now = () => new Date()) {
  const upsert = db.prepare(`
    INSERT INTO timers (slug, title, emoji, category, target_at, is_curated, created_at)
    VALUES (?, ?, ?, ?, ?, 1, ?)
    ON CONFLICT (slug) DO UPDATE SET
      title = excluded.title,
      emoji = excluded.emoji,
      category = excluded.category,
      target_at = excluded.target_at
    WHERE timers.is_curated = 1
  `);
  const createdAt = now().toISOString();
  for (const t of CURATED_TIMERS) {
    upsert.run(t.slug, t.title, t.emoji, t.category, t.target_at, createdAt);
  }

  // Remove curated rows that fell out of the list (never touches custom rows).
  const placeholders = CURATED_TIMERS.map(() => '?').join(', ');
  db.prepare(`DELETE FROM timers WHERE is_curated = 1 AND slug NOT IN (${placeholders})`)
    .run(...CURATED_TIMERS.map((t) => t.slug));
}
