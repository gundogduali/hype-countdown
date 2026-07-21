import { useEffect, useRef, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { motion } from 'motion/react'
import { reactToTimer } from '../api/client'
import Toast from './Toast'

/**
 * Hype/ReactionBar (RX-4) — fixed 5-emoji tap bar under a timer's share row.
 * Design: ugc_design.pen `Hype/ReactionBar` (MtevY) + states/responsive note (Y6uSPu).
 *
 * - Counts come from the timer's `reactions` field (already on getTimer/getTimers).
 * - Tap: optimistic +1 + scale-bounce, reconciled with the server's live `reactions`.
 * - A browser that already reacted with an emoji (localStorage) shows it "active"
 *   (soft purple fill/border/glow) and that single emoji becomes untappable again —
 *   this is a client UX nicety only; the server is the real source of truth
 *   (per-(slug, emoji, IP) uniqueness, enforced regardless of what the UI shows).
 */
const EMOJIS = ['🔥', '⏳', '🎉', '😱', '👀']

function storageKey(slug) {
  return `hype:reacted:${slug}`
}

function readReacted(slug) {
  try {
    const raw = window.localStorage.getItem(storageKey(slug))
    const parsed = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed : [])
  } catch {
    // localStorage unavailable (private mode / quota) — active state just won't persist
    return new Set()
  }
}

function writeReacted(slug, set) {
  try {
    window.localStorage.setItem(storageKey(slug), JSON.stringify([...set]))
  } catch {
    // best-effort only
  }
}

function normalizeReactions(reactions) {
  const result = {}
  for (const emoji of EMOJIS) {
    result[emoji] = typeof reactions?.[emoji] === 'number' ? reactions[emoji] : 0
  }
  return result
}

/** Design note: counts must support abbreviated formats (24, 342, 1.2k, 12.4k, 100k+). */
function ReactionCount({ value, active }) {
  const colorClass = active ? 'text-hype-purple' : 'text-hype-text-2'
  if (value >= 100000) {
    return (
      <span className={`font-mono text-[11px] font-semibold tabular-nums sm:text-[13px] ${colorClass}`}>
        100k+
      </span>
    )
  }
  return (
    <span className={`lowercase font-mono text-[11px] font-semibold tabular-nums sm:text-[13px] ${colorClass}`}>
      <NumberFlow value={value} format={{ notation: 'compact', maximumFractionDigits: 1 }} trend={1} />
    </span>
  )
}

function ReactionButton({ emoji, count, active, justTapped, onTap }) {
  return (
    <motion.button
      type="button"
      onClick={onTap}
      disabled={active}
      aria-pressed={active}
      aria-label={`React with ${emoji}${active ? ', already reacted' : ''}`}
      animate={justTapped ? { scale: [1, 1.15, 1] } : { scale: 1 }}
      transition={{ type: 'spring', stiffness: 500, damping: 20 }}
      className={`flex shrink-0 flex-col items-center gap-0.5 rounded-hype-md border px-2.5 py-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hype-purple sm:gap-1 sm:px-[18px] sm:py-3 ${
        active
          ? 'cursor-default border-hype-purple bg-hype-purple-soft shadow-[0_2px_18px] shadow-hype-purple/35'
          : 'cursor-pointer border-hype-border bg-hype-surface hover:border-hype-border-strong hover:bg-hype-surface-2'
      }`}
    >
      <span className="text-[20px] leading-none text-hype-text sm:text-[26px]" aria-hidden="true">
        {emoji}
      </span>
      <ReactionCount value={count} active={active} />
    </motion.button>
  )
}

export default function ReactionBar({ slug, reactions }) {
  const [counts, setCounts] = useState(() => normalizeReactions(reactions))
  const [reacted, setReacted] = useState(() => readReacted(slug))
  const [justTapped, setJustTapped] = useState(null)
  const [toastMessage, setToastMessage] = useState(null)
  const pendingRef = useRef(new Set())
  // Two independent timer refs (not one shared bucket): clearing the
  // just-tapped bounce timer for a new tap must never cancel a still-pending
  // toast-hide timer from an earlier, unrelated failed tap (and vice versa).
  const justTappedTimerRef = useRef(null)
  const toastTimerRef = useRef(null)

  useEffect(() => {
    setCounts(normalizeReactions(reactions))
  }, [reactions])

  useEffect(() => {
    setReacted(readReacted(slug))
  }, [slug])

  // Keep localStorage in sync with the `reacted` state (covers both taps and
  // the slug-change reset above) in one place, instead of writing manually at
  // every call site.
  useEffect(() => {
    writeReacted(slug, reacted)
  }, [slug, reacted])

  useEffect(
    () => () => {
      clearTimeout(justTappedTimerRef.current)
      clearTimeout(toastTimerRef.current)
    },
    []
  )

  async function handleTap(emoji) {
    if (reacted.has(emoji) || pendingRef.current.has(emoji)) return
    pendingRef.current.add(emoji)

    // Per-emoji functional updates only — never overwrite the whole
    // counts/reacted object from a snapshot taken at tap time. If a second
    // emoji is tapped while this request is still in flight, a whole-object
    // overwrite here would clobber that other emoji's concurrent optimistic
    // update or server reconciliation.
    setReacted((prev) => {
      const next = new Set(prev)
      next.add(emoji)
      return next
    })
    setCounts((c) => ({ ...c, [emoji]: (c[emoji] ?? 0) + 1 }))
    setJustTapped(emoji)
    clearTimeout(justTappedTimerRef.current)
    justTappedTimerRef.current = setTimeout(
      () => setJustTapped((current) => (current === emoji ? null : current)),
      200
    )

    try {
      const data = await reactToTimer(slug, emoji)
      const serverCount = data?.reactions?.[emoji]
      if (typeof serverCount === 'number') {
        setCounts((c) => ({ ...c, [emoji]: serverCount }))
      }
    } catch (err) {
      // Revert only this emoji — leave any other emoji's state (from a
      // concurrent tap) untouched.
      setReacted((prev) => {
        if (!prev.has(emoji)) return prev
        const next = new Set(prev)
        next.delete(emoji)
        return next
      })
      setCounts((c) => ({ ...c, [emoji]: Math.max(0, (c[emoji] ?? 1) - 1) }))
      setToastMessage(err.message || 'Could not save your reaction. Please try again.')
      clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => setToastMessage(null), 3000)
    } finally {
      pendingRef.current.delete(emoji)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        role="group"
        aria-label="React to this timer"
        className="flex flex-nowrap items-center justify-center gap-1.5 sm:gap-2.5"
      >
        {EMOJIS.map((emoji) => (
          <ReactionButton
            key={emoji}
            emoji={emoji}
            count={counts[emoji]}
            active={reacted.has(emoji)}
            justTapped={justTapped === emoji}
            onTap={() => handleTap(emoji)}
          />
        ))}
      </div>
      <Toast show={Boolean(toastMessage)}>{toastMessage}</Toast>
    </div>
  )
}
