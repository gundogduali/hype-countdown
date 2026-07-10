/**
 * Category constants — API values match `docs/api.md` exactly.
 * Card tag strings are the UPPERCASE variants used on timer cards.
 */
export const CATEGORIES = [
  { value: 'games', label: 'Games 🎮', plain: 'Games', tag: 'GAMES' },
  { value: 'sports', label: 'Sports ⚽', plain: 'Sports', tag: 'SPORTS' },
  { value: 'movies-tv', label: 'Movies & TV 🎬', plain: 'Movies & TV', tag: 'MOVIES & TV' },
  { value: 'tech', label: 'Tech 📱', plain: 'Tech', tag: 'TECH' },
  { value: 'holidays', label: 'Holidays 🎉', plain: 'Holidays', tag: 'HOLIDAYS' },
]

const byValue = new Map(CATEGORIES.map((c) => [c.value, c]))

export const categoryTag = (value) => byValue.get(value)?.tag ?? null
export const categoryPlain = (value) => byValue.get(value)?.plain ?? null
