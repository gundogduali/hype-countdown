import { Link } from 'react-router-dom'
import { categoryTag } from '../lib/categories'
import { formatCardRemaining, formatLocalDate, getRemaining } from '../lib/time'

/**
 * Hype/TimerCard — the remaining time ticks live (via `now` from the parent).
 * Hover: purple border + purple glow + -4px lift, 200ms ease-out.
 */
export default function TimerCard({ timer, now }) {
  const remaining = getRemaining(timer.target_at, now)
  const tag = timer.category ? categoryTag(timer.category) : null

  return (
    <Link
      to={`/t/${timer.slug}`}
      className="group flex flex-col gap-4 rounded-hype-md border border-hype-border bg-hype-surface p-6 transition-all duration-200 ease-out hover:-translate-y-1 hover:border-hype-purple hover:shadow-[0_8px_32px] hover:shadow-hype-purple/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hype-purple"
    >
      <div className="flex items-center justify-between">
        <span className="text-[34px] leading-none" aria-hidden="true">
          {timer.emoji}
        </span>
        {tag && (
          <span className="rounded-full border border-hype-border bg-hype-surface-2 px-3 py-[5px] font-mono text-[11px] font-medium tracking-[1.5px] text-hype-text-2">
            {tag}
          </span>
        )}
      </div>
      <h3 className="font-display text-xl font-semibold leading-snug text-hype-text">
        {timer.title}
      </h3>
      <p className="font-mono text-[26px] font-semibold tracking-[-0.5px] text-hype-text tabular-nums">
        {formatCardRemaining(remaining)}
      </p>
      <p className="text-[13px] text-hype-text-3">{formatLocalDate(timer.target_at)}</p>
    </Link>
  )
}

/** Explore loading state: skeleton card with surface-2 shimmer. */
export function TimerCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4 rounded-hype-md border border-hype-border bg-hype-surface p-6" aria-hidden="true">
      <div className="flex items-center justify-between">
        <div className="size-9 rounded-full bg-hype-surface-2" />
        <div className="h-6 w-20 rounded-full bg-hype-surface-2" />
      </div>
      <div className="h-5 w-3/4 rounded bg-hype-surface-2" />
      <div className="h-8 w-2/3 rounded bg-hype-surface-2" />
      <div className="h-3.5 w-1/3 rounded bg-hype-surface-2" />
    </div>
  )
}
