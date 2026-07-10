import { useEffect } from 'react'
import { ButtonGhost, ButtonPrimary } from '../components/Button'
import GlowStreaks from '../components/GlowStreaks'
import { STREAKS_404 } from '../lib/streaks'

/** 404 content — used by both the `*` route and unknown slugs (timer_not_found). */
export function NotFoundContent() {
  useEffect(() => {
    document.title = 'Not found — Hype ⏳'
  }, [])

  return (
    <main className="glow-404 relative flex flex-1 flex-col">
      <GlowStreaks streaks={STREAKS_404} />
      <div className="page-gutter relative flex flex-1 flex-col items-center justify-center gap-5 pb-[60px] text-center">
        <div className="flex items-center gap-3" aria-hidden="true">
          <span className="font-mono text-[clamp(88px,12vw,140px)] font-bold leading-none text-hype-text">4</span>
          <span className="text-[clamp(70px,9vw,110px)] leading-none">⏳</span>
          <span className="font-mono text-[clamp(88px,12vw,140px)] font-bold leading-none text-hype-text">4</span>
        </div>
        <h1 className="font-display text-[clamp(26px,4vw,34px)] font-bold text-hype-text">
          This timer doesn't exist.
        </h1>
        <p className="text-base text-hype-text-2">
          The link may be wrong, or the timer was never created.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <ButtonGhost to="/">Back to Explore</ButtonGhost>
          <ButtonPrimary to="/create">Create Timer</ButtonPrimary>
        </div>
      </div>
    </main>
  )
}

export default function NotFound() {
  return <NotFoundContent />
}
