import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { getMessages } from '../api/client'

/**
 * Hype/MessageList (HM-5) — public, anonymous message feed under a timer.
 * Design: ugc_design.pen `Hype/MessageList` (DDSQB) + gallery states (`fRAix`).
 * Copy: docs/copy.md "Timer Detail — Hype Reactions & Messages (v2.2)".
 *
 * Fetches `GET /api/timers/:slug/messages` itself (newest first, capped at 50
 * server-side). Exposes `prependMessage` via ref so a sibling MessageInput can
 * add a freshly-posted message to the visible list without a full refetch —
 * the list is still the single source of truth once the page reloads, since
 * this same fetch runs again on mount.
 */
const MESSAGE_CAP = 50

function MessageRow({ message }) {
  return (
    <li className="flex w-full items-center gap-3 rounded-hype-sm border border-hype-border bg-hype-surface-2 px-4 py-3">
      <span className="shrink-0 text-base text-hype-text-3" aria-hidden="true">
        💬
      </span>
      <p className="min-w-0 flex-1 break-words text-[14px] text-hype-text">{message.message}</p>
    </li>
  )
}

function ListSkeleton() {
  return (
    <div className="flex w-full flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[46px] w-full animate-pulse rounded-hype-sm bg-hype-surface-2" />
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 rounded-hype-sm border border-hype-border bg-hype-surface-2 px-4 py-6 text-center">
      <span className="text-[32px] leading-none" aria-hidden="true">
        💭
      </span>
      <p className="text-[14px] font-semibold text-hype-text">No messages yet.</p>
      <p className="text-[13px] text-hype-text-2">Be the first to hype this up. 🔥</p>
    </div>
  )
}

function ListError({ onRetry }) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-3 rounded-hype-sm border border-hype-border bg-hype-surface-2 px-4 py-6 text-center">
      <p className="text-[14px] text-hype-text-2">Something went wrong.</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-hype-sm border border-hype-border-strong bg-hype-surface px-4 py-2 text-[13px] font-medium text-hype-text transition hover:border-hype-purple hover:bg-hype-surface-2"
      >
        Retry
      </button>
    </div>
  )
}

const MessageList = forwardRef(function MessageList({ slug }, ref) {
  const [{ status, messages }, setState] = useState({ status: 'loading', messages: [] })
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let alive = true
    setState({ status: 'loading', messages: [] })
    getMessages(slug)
      .then((data) => alive && setState({ status: 'success', messages: data.messages ?? [] }))
      .catch(() => alive && setState({ status: 'error', messages: [] }))
    return () => {
      alive = false
    }
  }, [slug, retryKey])

  useImperativeHandle(ref, () => ({
    prependMessage(message) {
      setState((prev) => ({
        status: 'success',
        messages: [message, ...prev.messages].slice(0, MESSAGE_CAP),
      }))
    },
  }))

  const count = status === 'success' ? messages.length : 0

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex w-full items-center justify-between">
        <span className="font-mono text-xs font-medium tracking-[1.5px] text-hype-text-3">
          {count} MESSAGES
        </span>
      </div>
      {status === 'loading' ? (
        <ListSkeleton />
      ) : status === 'error' ? (
        <ListError onRetry={() => setRetryKey((k) => k + 1)} />
      ) : messages.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex w-full flex-col gap-2">
          {messages.map((m) => (
            <MessageRow key={m.id} message={m} />
          ))}
        </ul>
      )}
    </div>
  )
})

export default MessageList
