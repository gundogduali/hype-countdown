import NumberFlow from '@number-flow/react'

/**
 * Hype/CountUnit row — DAYS : HOURS : MINUTES : SECONDS.
 * Digit transitions use NumberFlow (the library behind Skiper UI's counter
 * component): an upward slide/blur transition on each second tick. Geist Mono's
 * fixed width keeps the layout from jumping.
 *
 * size: 'hero' (Explore) | 'detail' (Timer Detail)
 * loading: dimmed units showing '--' (design note: STATES & DATA)
 */
const SIZES = {
  hero: {
    wrap: 'flex flex-wrap items-start justify-center gap-x-3 gap-y-6 md:gap-6',
    value: 'text-[clamp(56px,9vw,96px)]',
    sep: 'text-[clamp(32px,5vw,64px)] pt-[clamp(4px,0.9vw,10px)]',
    label: 'text-[13px]',
    sepHidden: 'hidden md:block',
  },
  detail: {
    wrap: 'grid grid-cols-2 gap-x-10 gap-y-8 md:flex md:items-start md:gap-9',
    value: 'text-[clamp(64px,10vw,132px)]',
    sep: 'text-[clamp(44px,6.5vw,88px)] pt-[clamp(6px,1.1vw,14px)]',
    label: 'text-sm',
    sepHidden: 'hidden md:block',
  },
}

/** "1 day" / "2 days" — n=1 singular, plural otherwise (aria-label copy). */
const plural = (n, unit) => `${n} ${unit}${n === 1 ? '' : 's'}`

function Unit({ value, label, size, loading }) {
  const s = SIZES[size]
  return (
    <div className="flex flex-col items-center gap-2.5">
      <span
        className={`font-mono font-bold leading-none tracking-[-2px] tabular-nums ${s.value} ${
          loading ? 'text-hype-text-3 opacity-60' : 'text-hype-text'
        }`}
      >
        {loading ? (
          '--'
        ) : (
          <NumberFlow value={value} format={{ minimumIntegerDigits: 2 }} trend={1} />
        )}
      </span>
      <span className={`font-mono font-medium tracking-[4px] text-hype-text-3 ${s.label}`}>
        {label}
      </span>
    </div>
  )
}

export default function Countdown({ remaining, size = 'hero', loading = false }) {
  const s = SIZES[size]
  const r = remaining ?? { days: 0, hours: 0, minutes: 0, seconds: 0 }
  const sep = (
    <span
      aria-hidden="true"
      className={`font-mono font-light leading-none text-hype-text-3 ${s.sep} ${s.sepHidden}`}
    >
      :
    </span>
  )
  return (
    <div
      className={s.wrap}
      role="timer"
      aria-live="off"
      aria-label={
        loading
          ? 'Countdown loading'
          : `${plural(r.days, 'day')} ${plural(r.hours, 'hour')} ${plural(r.minutes, 'minute')} ${plural(r.seconds, 'second')} left`
      }
    >
      <Unit value={r.days} label="DAYS" size={size} loading={loading} />
      {sep}
      <Unit value={r.hours} label="HOURS" size={size} loading={loading} />
      {sep}
      <Unit value={r.minutes} label="MINUTES" size={size} loading={loading} />
      {sep}
      <Unit value={r.seconds} label="SECONDS" size={size} loading={loading} />
    </div>
  )
}
