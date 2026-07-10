import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { getTimer } from '../api/client'
import { ButtonGhost, ButtonPrimary } from '../components/Button'
import Countdown from '../components/Countdown'
import GlowStreaks from '../components/GlowStreaks'
import { STREAKS_DETAIL } from '../lib/streaks'
import Toast from '../components/Toast'
import useCopyLink from '../hooks/useCopyLink'
import useNow from '../hooks/useNow'
import { categoryTag } from '../lib/categories'
import { formatLocalDateTime, getRemaining } from '../lib/time'
import { NotFoundContent } from './NotFound'

function CategoryTag({ category }) {
  const tag = categoryTag(category)
  if (!tag) return null
  return (
    <span className="rounded-full border border-hype-purple bg-hype-purple-soft px-3.5 py-1.5 font-mono text-xs font-medium tracking-[2px] text-hype-purple">
      {tag}
    </span>
  )
}

function CopyLinkButton({ copied, onCopy, pulse }) {
  return (
    <ButtonGhost onClick={onCopy} className={pulse && !copied ? 'animate-copy-pulse' : ''}>
      {copied ? '✓ Copied' : 'Copy link'}
    </ButtonGhost>
  )
}

function DetailError({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center" role="alert">
      <span className="text-5xl" aria-hidden="true">⚠️</span>
      <h1 className="font-display text-[26px] font-semibold text-hype-text">Something went wrong.</h1>
      <p className="text-[15px] text-hype-text-2">{error?.message ?? 'Please try again.'}</p>
      <div className="flex gap-4 pt-3">
        <ButtonGhost onClick={onRetry}>Retry</ButtonGhost>
        <ButtonPrimary to="/">Back to Explore</ButtonPrimary>
      </div>
    </div>
  )
}

export default function TimerDetail() {
  const { slug } = useParams()
  const location = useLocation()
  const justCreated = Boolean(location.state?.justCreated)
  const [{ status, timer, error }, setState] = useState({ status: 'loading', timer: null, error: null })
  const [retryKey, setRetryKey] = useState(0)
  const now = useNow(status === 'success')
  const { copied, toastVisible, copy } = useCopyLink()

  useEffect(() => {
    let alive = true
    setState({ status: 'loading', timer: null, error: null })
    getTimer(slug)
      .then((data) => alive && setState({ status: 'success', timer: data.timer, error: null }))
      .catch((e) => alive && setState({ status: 'error', timer: null, error: e }))
    return () => {
      alive = false
    }
  }, [slug, retryKey])

  useEffect(() => {
    if (timer) document.title = `${timer.emoji} ${timer.title} — Hype ⏳`
    return () => {
      document.title = "Hype ⏳ — Countdown to what's next"
    }
  }, [timer])

  if (status === 'error' && error?.code === 'timer_not_found') {
    return <NotFoundContent />
  }

  const remaining = timer ? getRemaining(timer.target_at, now) : null
  const done = remaining?.done ?? false

  return (
    <main className="glow-detail relative flex flex-1 flex-col">
      <GlowStreaks streaks={STREAKS_DETAIL} />
      <div className="page-gutter relative flex flex-1 flex-col items-center justify-center gap-6 py-14 pb-16 text-center">
        {status === 'error' ? (
          <DetailError error={error} onRetry={() => setRetryKey((k) => k + 1)} />
        ) : status === 'loading' ? (
          <>
            {/* Detail loading: dimmed units showing '--' instead of the counter */}
            <div className="size-16 animate-pulse rounded-full bg-hype-surface-2" aria-hidden="true" />
            <div className="h-10 w-64 animate-pulse rounded-lg bg-hype-surface-2 md:w-96" aria-hidden="true" />
            <div className="h-5 w-72 animate-pulse rounded bg-hype-surface-2" aria-hidden="true" />
            <div className="py-6">
              <Countdown size="detail" loading />
            </div>
            <span className="sr-only">Loading…</span>
          </>
        ) : done ? (
          <>
            <span className="text-7xl leading-none" aria-hidden="true">{timer.emoji}</span>
            <h1 className="font-display text-[clamp(30px,4vw,42px)] font-bold text-hype-text">
              {timer.title}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <CategoryTag category={timer.category} />
              <span className="text-base text-hype-text-2">{formatLocalDateTime(timer.target_at)}</span>
            </div>
            <div className="flex flex-col items-center gap-5 py-4">
              <span className="text-[clamp(56px,8vw,88px)] leading-none" aria-hidden="true">🎉</span>
              <p className="bg-gradient-to-r from-hype-purple via-hype-pink to-hype-cyan bg-clip-text font-display text-[clamp(44px,8vw,88px)] font-bold leading-none tracking-[-1px] text-transparent">
                It's time!
              </p>
              <p className="font-mono text-sm tracking-[3px] text-hype-text-2">
                THE WAIT IS OVER
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <CopyLinkButton copied={copied} onCopy={() => copy()} pulse={justCreated} />
              <ButtonPrimary to="/create">Create your own timer</ButtonPrimary>
            </div>
          </>
        ) : (
          <>
            <span className="text-[64px] leading-none" aria-hidden="true">{timer.emoji}</span>
            <h1 className="font-display text-[clamp(30px,4vw,42px)] font-bold text-hype-text">
              {timer.title}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-3.5">
              <CategoryTag category={timer.category} />
              <span className="text-base text-hype-text-2">{formatLocalDateTime(timer.target_at)}</span>
            </div>
            <div className="py-6">
              <Countdown remaining={remaining} size="detail" />
            </div>
            <CopyLinkButton copied={copied} onCopy={() => copy()} pulse={justCreated} />
          </>
        )}
      </div>
      <Toast show={toastVisible}>✓ Link copied to clipboard</Toast>
    </main>
  )
}
