import { useCallback, useEffect, useRef, useState } from 'react'
import { getTimers } from '../api/client'
import { ButtonGhost, ButtonPrimary } from '../components/Button'
import Chip from '../components/Chip'
import Countdown from '../components/Countdown'
import GlowStreaks from '../components/GlowStreaks'
import { STREAKS_EXPLORE } from '../lib/streaks'
import TimerCard, { TimerCardSkeleton } from '../components/TimerCard'
import useNow from '../hooks/useNow'
import { CATEGORIES, categoryPlain } from '../lib/categories'
import { formatLocalDateTime, getRemaining } from '../lib/time'

function Hero({ timer, now, loading }) {
  const remaining = timer ? getRemaining(timer.target_at, now) : null
  return (
    <section className="page-gutter flex flex-col items-center gap-7 pt-12 pb-16 text-center md:pt-[72px]">
      <span className="rounded-full border border-hype-purple bg-hype-purple-soft px-4 py-[7px] font-mono text-xs font-medium tracking-[2px] text-hype-purple">
        ⚡ FEATURED COUNTDOWN
      </span>
      {loading ? (
        <div className="h-11 w-72 animate-pulse rounded-lg bg-hype-surface-2 md:w-[560px]" />
      ) : (
        <h1 className="font-display text-[clamp(28px,4vw,44px)] font-bold leading-tight text-hype-text">
          {timer.emoji} {timer.title}
        </h1>
      )}
      <Countdown remaining={remaining} size="hero" loading={loading} />
      {loading ? (
        <div className="h-4 w-64 animate-pulse rounded bg-hype-surface-2" />
      ) : (
        <p className="text-[15px] text-hype-text-3">
          {formatLocalDateTime(timer.target_at)}
          {timer.category ? ` · ${categoryPlain(timer.category)}` : ''}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-center gap-4">
        <ButtonGhost to={timer ? `/t/${timer.slug}` : '/'} aria-disabled={!timer}>
          Open fullscreen →
        </ButtonGhost>
        <ButtonPrimary to="/create">Create Timer</ButtonPrimary>
      </div>
    </section>
  )
}

function EmptyCategory({ onShowAll }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-hype-md border border-hype-border bg-hype-surface px-10 py-16 text-center">
      <span className="text-5xl" aria-hidden="true">🔭</span>
      <h3 className="font-display text-[22px] font-semibold text-hype-text">
        No timers in this category yet.
      </h3>
      <p className="text-[15px] text-hype-text-2">
        Create your own countdown and share it with a link.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-4 pt-3">
        <ButtonGhost onClick={onShowAll}>Show all</ButtonGhost>
        <ButtonPrimary to="/create">Create Timer</ButtonPrimary>
      </div>
    </div>
  )
}

function LoadError({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-hype-md border border-hype-border bg-hype-surface px-10 py-16 text-center" role="alert">
      <span className="text-5xl" aria-hidden="true">⚠️</span>
      <h3 className="font-display text-[22px] font-semibold text-hype-text">
        Something went wrong.
      </h3>
      <p className="text-[15px] text-hype-text-2">{error?.message ?? 'Please try again.'}</p>
      <div className="pt-3">
        <ButtonGhost onClick={onRetry}>Retry</ButtonGhost>
      </div>
    </div>
  )
}

export default function Explore() {
  const [category, setCategory] = useState('')
  const [heroTimers, setHeroTimers] = useState(null) // unfiltered list (hero = first item)
  const [gridTimers, setGridTimers] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const now = useNow()
  const reqId = useRef(0)

  const load = useCallback(async (cat) => {
    // Guard against a stale response overwriting a newer one on fast filter changes (race)
    const id = ++reqId.current
    setStatus('loading')
    setError(null)
    try {
      const data = await getTimers(cat)
      if (id !== reqId.current) return
      setGridTimers(data.timers)
      // The list arrives target_at ASC → hero = first item of the unfiltered list
      if (!cat) setHeroTimers(data.timers)
      setStatus('success')
    } catch (e) {
      if (id !== reqId.current) return
      setError(e)
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    load(category)
  }, [category, load])

  useEffect(() => {
    document.title = "Hype ⏳ — Countdown to what's next"
  }, [])

  const hero = heroTimers?.[0] ?? null
  const heroLoading = heroTimers === null

  return (
    <main className="glow-explore relative flex-1">
      <GlowStreaks streaks={STREAKS_EXPLORE} />
      <div className="relative">
        {(heroLoading && status === 'error') || (heroTimers && !hero) ? null : (
          <Hero timer={hero} now={now} loading={heroLoading} />
        )}

        <section className="page-gutter flex flex-col gap-6 pb-12 pt-4">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-display text-[26px] font-semibold text-hype-text">
              Popular countdowns
            </h2>
            <span className="shrink-0 whitespace-nowrap font-mono text-[13px] text-hype-text-3">
              {status === 'success' ? `${gridTimers.length} ACTIVE TIMERS` : '…'}
            </span>
          </div>

          <div
            className="-mx-5 flex gap-3 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
            role="group"
            aria-label="Category filter"
          >
            <Chip active={category === ''} onClick={() => setCategory('')}>
              All
            </Chip>
            {CATEGORIES.map((c) => (
              <Chip
                key={c.value}
                active={category === c.value}
                onClick={() => setCategory(category === c.value ? '' : c.value)}
              >
                {c.label}
              </Chip>
            ))}
          </div>

          {status === 'error' ? (
            <LoadError error={error} onRetry={() => load(category)} />
          ) : status === 'loading' ? (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <TimerCardSkeleton key={i} />
              ))}
            </div>
          ) : gridTimers.length === 0 ? (
            <EmptyCategory onShowAll={() => setCategory('')} />
          ) : (
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              {gridTimers.map((timer) => (
                <TimerCard key={timer.slug} timer={timer} now={now} />
              ))}
            </div>
          )}
        </section>

        <section className="page-gutter pb-[72px]">
          <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-hype-lg border border-hype-purple bg-hype-surface px-8 py-12 text-center md:px-16">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0"
              style={{
                backgroundImage:
                  'radial-gradient(120% 160% at 50% 0%, color-mix(in srgb, var(--color-hype-purple) 17%, transparent), color-mix(in srgb, var(--color-hype-pink) 7%, transparent))',
              }}
            />
            <h2 className="relative font-display text-[clamp(24px,3vw,30px)] font-bold text-hype-text">
              Can't find your moment?
            </h2>
            <p className="relative text-base text-hype-text-2">
              Create your own countdown and share it with a link.
            </p>
            <div className="relative pt-3">
              <ButtonPrimary to="/create">Create Timer</ButtonPrimary>
            </div>
          </div>
        </section>

        <footer className="page-gutter flex flex-col items-center justify-between gap-2 border-t border-hype-border py-6 sm:flex-row">
          <span className="text-[13px] text-hype-text-3">Hype ⏳ — count down together</span>
          <span className="font-mono text-xs tracking-wide text-hype-text-3">
            ALL TIMES IN YOUR LOCAL TIMEZONE
          </span>
        </footer>
      </div>
    </main>
  )
}
