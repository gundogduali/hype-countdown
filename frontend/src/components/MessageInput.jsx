import { useState } from 'react'
import { CircleAlert, Send } from 'lucide-react'
import { ApiError, postMessage } from '../api/client'

/**
 * Hype/MessageInput (HM-5) — free-text message composer under the reaction bar.
 * Design: ugc_design.pen `Hype/MessageInput` (fWv8X) + gallery states (`fRAix`).
 * Copy: docs/copy.md "Timer Detail — Hype Reactions & Messages (v2.2)".
 *
 * - 80-char limit is enforced client-side (input `maxLength`) as well as server-side.
 * - Errors are shown inline in the MetaRow's StatusWrap slot (the design's own
 *   dedicated error slot for this component — parallel to Create.jsx's inline
 *   field-error pattern, not the bottom Toast used for the idempotent ReactionBar).
 * - Every server error `code` maps to its own ratified string; nothing falls back
 *   to a single generic message except the true `generic`/unmapped case.
 */
const MAX_LENGTH = 80
const NEAR_LIMIT_THRESHOLD = 70

/** Maps a submission error to the exact ratified copy string for its code. */
function mapMessageError(err) {
  if (!(err instanceof ApiError)) {
    return 'Something went wrong. Please try again.'
  }
  switch (err.code) {
    case 'invalid_message':
      return 'Type something first.'
    case 'message_too_long':
      return 'Keep it under 80 characters.'
    case 'message_repeated_chars':
      return 'Looks like spam — try rewriting that.'
    case 'message_contains_link':
      return "Links aren't allowed here."
    case 'message_blocked_content':
      return "That message isn't allowed. Try something else."
    case 'rate_limited': {
      const mins = err.retryAfter ? Math.max(1, Math.ceil(err.retryAfter / 60)) : null
      return mins
        ? `Too many messages. Try again in about ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`
        : 'Too many messages. Try again in a bit.'
    }
    case 'network':
      return 'Could not reach the server. Check your connection and try again.'
    default:
      return err.message || 'Something went wrong. Please try again.'
  }
}

export default function MessageInput({ slug, onPosted }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const count = value.length
  const counterColorClass = count >= NEAR_LIMIT_THRESHOLD ? 'text-hype-pink' : 'text-hype-text-3'
  // Only disabled while a submit is in flight (matches Create.jsx's convention):
  // an empty/whitespace-only value is still clickable so the client-side guard
  // below can surface its own "Type something first." error, rather than the
  // button silently blocking that path from ever being reachable.
  const canSubmit = !submitting

  async function handleSubmit(e) {
    e.preventDefault()
    const trimmed = value.trim()
    if (!trimmed) {
      setError('Type something first.')
      return
    }
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      const data = await postMessage(slug, trimmed)
      onPosted?.(data.message)
      setValue('')
    } catch (err) {
      setError(mapMessageError(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full flex-col gap-3 rounded-hype-md border border-hype-border bg-hype-surface p-4"
    >
      <div className="flex w-full items-center gap-3">
        <div
          className={`flex w-full items-center rounded-hype-sm border bg-hype-surface-2 px-4 py-3 ${
            error ? 'border-hype-danger' : 'border-hype-border'
          }`}
        >
          <label htmlFor="hype-message-input" className="sr-only">
            Share the hype
          </label>
          <input
            id="hype-message-input"
            type="text"
            value={value}
            maxLength={MAX_LENGTH}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Share the hype… 🔥"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? 'hype-message-error' : undefined}
            className="w-full bg-transparent text-[15px] text-hype-text outline-none placeholder:text-hype-text-2"
          />
        </div>
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send message"
          className="flex shrink-0 items-center justify-center rounded-hype-sm bg-gradient-to-r from-hype-purple to-hype-pink px-4 py-3 text-white transition duration-200 ease-out hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5" aria-live="polite">
          {error && (
            <>
              <CircleAlert size={14} className="shrink-0 text-hype-danger" aria-hidden="true" />
              <p id="hype-message-error" className="text-[13px] text-hype-danger" role="alert">
                {error}
              </p>
            </>
          )}
        </div>
        <span className={`font-mono text-[13px] ${counterColorClass}`} aria-hidden="true">
          {count} / {MAX_LENGTH}
        </span>
      </div>
    </form>
  )
}
