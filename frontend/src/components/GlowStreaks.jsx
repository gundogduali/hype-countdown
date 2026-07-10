/**
 * Background glow streaks — 4px-tall, 42px-blurred, rotated lines with a slow
 * 8-12s opacity pulse (index.css `.streak`).
 * Layouts: src/lib/streaks.js
 */
const COLOR = {
  purple: 'var(--color-hype-purple)',
  pink: 'var(--color-hype-pink)',
  cyan: 'var(--color-hype-cyan)',
}

export default function GlowStreaks({ streaks }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {streaks.map((s, i) => (
        <div
          key={i}
          className="streak absolute h-1 blur-[42px]"
          style={{
            width: `${s.w}%`,
            left: `${s.x}%`,
            top: s.y,
            background: COLOR[s.color],
            transform: `rotate(${s.rotate}deg)`,
            animationDuration: `${8 + i * 1.4}s`,
            animationDelay: `${i * 1.1}s`,
          }}
        />
      ))}
    </div>
  )
}
