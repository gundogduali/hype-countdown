import { useEffect, useState } from 'react'
import { CircleAlert, Calendar, Clock3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ApiError, createTimer } from '../api/client'
import { ButtonPrimary } from '../components/Button'
import Chip from '../components/Chip'
import GlowStreaks from '../components/GlowStreaks'
import { STREAKS_CREATE } from '../lib/streaks'
import { CATEGORIES } from '../lib/categories'
import { gmtLabel, serverNow } from '../lib/time'

const EMOJIS = ['⏳', '🎮', '⚽', '🎬', '📱', '🎉', '🎂', '❤️', '✈️', '🚀', '🏆', '🎓', '🎁', '🌙', '🔥', '⭐']

const HUNDRED_YEARS_MS = 100 * 365.25 * 24 * 60 * 60 * 1000

function FieldError({ children }) {
  if (!children) return null
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-hype-danger" role="alert">
      <CircleAlert size={14} aria-hidden="true" />
      {children}
    </p>
  )
}

const inputBase =
  'w-full rounded-hype-sm border bg-hype-surface-2 px-4 py-3.5 text-[15px] text-hype-text outline-none transition placeholder:text-hype-text-3 focus:border-hype-purple'
const inputOk = 'border-hype-border-strong'
const inputErr = 'border-[1.5px] border-hype-danger bg-hype-danger-soft'

/** Maps server error codes to field errors / the form message (docs/api.md). */
function mapServerError(e, setErrors) {
  if (!(e instanceof ApiError)) {
    setErrors({ form: 'Something went wrong. Please try again.' })
    return
  }
  switch (e.code) {
    case 'invalid_title':
      setErrors({ title: 'Title must be 1–80 characters.' })
      break
    case 'target_in_past':
      setErrors({ target: 'Pick a date in the future.' })
      break
    case 'invalid_target_at':
      setErrors({ target: 'Pick a valid date and time (at most 100 years ahead).' })
      break
    case 'invalid_category':
      setErrors({ form: 'The selected category is invalid. Change it and try again.' })
      break
    case 'invalid_emoji':
      setErrors({ form: 'The selected emoji is invalid. Pick one from the palette.' })
      break
    case 'rate_limited': {
      const mins = e.retryAfter ? Math.max(1, Math.ceil(e.retryAfter / 60)) : null
      setErrors({
        form: mins
          ? `Too many timers created. Try again in about ${mins} ${mins === 1 ? 'minute' : 'minutes'}.`
          : 'Too many timers created. Try again in a bit.',
      })
      break
    }
    case 'network':
      setErrors({ form: 'Could not reach the server. Check your connection and try again.' })
      break
    default:
      setErrors({ form: e.message || 'Something went wrong. Please try again.' })
  }
}

export default function Create() {
  const navigate = useNavigate()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('')
  const [emoji, setEmoji] = useState('⏳')
  const [category, setCategory] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = 'New countdown — Hype ⏳'
    return () => {
      document.title = "Hype ⏳ — Countdown to what's next"
    }
  }, [])

  const clearError = (key) =>
    setErrors((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return

    // Client-side validation — errors are shown inline under each field
    const nextErrors = {}
    const trimmed = title.trim()
    if (!trimmed) {
      nextErrors.title = 'Title is required.'
    } else if (trimmed.length > 80) {
      nextErrors.title = 'Title must be 80 characters or less.'
    }
    let target = null
    if (!date || !time) {
      nextErrors.target = 'Pick a date and time.'
    } else {
      // The user enters local time → converted to UTC ISO before sending
      target = new Date(`${date}T${time}`)
      if (Number.isNaN(target.getTime())) {
        nextErrors.target = 'Pick a valid date and time.'
      } else if (target.getTime() <= serverNow()) {
        nextErrors.target = 'Pick a date in the future.'
      } else if (target.getTime() > serverNow() + HUNDRED_YEARS_MS) {
        nextErrors.target = 'Target can be at most 100 years ahead.'
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    try {
      const payload = { title: trimmed, target_at: target.toISOString(), emoji }
      if (category) payload.category = category
      const data = await createTimer(payload)
      // Success → /t/:slug + pulse highlight on 'Copy link'
      navigate(`/t/${data.timer.slug}`, { state: { justCreated: true } })
    } catch (err) {
      mapServerError(err, setErrors)
      setSubmitting(false)
    }
  }

  const titleCount = title.length
  const counterDanger = Boolean(errors.title) || titleCount > 80

  return (
    <main className="glow-create relative flex flex-1 flex-col">
      <GlowStreaks streaks={STREAKS_CREATE} />
      <div className="page-gutter relative flex flex-1 items-start justify-center py-10">
        <form
          onSubmit={handleSubmit}
          noValidate
          className="flex w-full max-w-[600px] flex-col gap-6 rounded-hype-lg border border-hype-border bg-hype-surface p-6 shadow-[0_24px_64px] shadow-black/50 sm:p-10 sm:px-11"
        >
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-[28px] font-bold text-hype-text">New countdown ⏳</h1>
            <p className="text-[15px] text-hype-text-2">Pick a moment, get a link, share the hype.</p>
          </div>

          {errors.form && (
            <p
              className="flex items-center gap-2 rounded-hype-sm border border-hype-danger bg-hype-danger-soft px-4 py-3 text-sm text-hype-danger"
              role="alert"
            >
              <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
              {errors.form}
            </p>
          )}

          {/* Title */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label htmlFor="title" className="text-sm font-semibold text-hype-text">
                Title
              </label>
              <span
                className={`font-mono text-xs ${counterDanger ? 'text-hype-danger' : 'text-hype-text-3'}`}
                aria-hidden="true"
              >
                {titleCount} / 80
              </span>
            </div>
            <input
              id="title"
              type="text"
              value={title}
              maxLength={80}
              onChange={(e) => {
                setTitle(e.target.value)
                clearError('title')
              }}
              placeholder="What are you waiting for?"
              aria-invalid={Boolean(errors.title)}
              className={`${inputBase} ${errors.title ? inputErr : inputOk}`}
            />
            <FieldError>{errors.title}</FieldError>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label htmlFor="date" className="text-sm font-semibold text-hype-text">
                Date
              </label>
              <div className="relative">
                <Calendar
                  size={16}
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${errors.target ? 'text-hype-danger' : 'text-hype-text-3'}`}
                />
                <input
                  id="date"
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value)
                    clearError('target')
                  }}
                  aria-invalid={Boolean(errors.target)}
                  style={{ colorScheme: 'dark' }}
                  className={`${inputBase} pl-11 ${errors.target ? inputErr : inputOk}`}
                />
              </div>
              <FieldError>{errors.target}</FieldError>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="time" className="text-sm font-semibold text-hype-text">
                Time
              </label>
              <div className="relative">
                <Clock3
                  size={16}
                  aria-hidden="true"
                  className={`pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 ${errors.target ? 'text-hype-danger' : 'text-hype-text-3'}`}
                />
                <input
                  id="time"
                  type="time"
                  value={time}
                  onChange={(e) => {
                    setTime(e.target.value)
                    clearError('target')
                  }}
                  aria-invalid={Boolean(errors.target)}
                  style={{ colorScheme: 'dark' }}
                  className={`${inputBase} pl-11 ${errors.target ? inputErr : inputOk}`}
                />
              </div>
              <p className="text-xs text-hype-text-3">In your local timezone ({gmtLabel()})</p>
            </div>
          </div>

          {/* Emoji palette */}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold text-hype-text">Emoji</legend>
            <div className="grid grid-cols-6 gap-2.5 md:grid-cols-8" role="radiogroup" aria-label="Pick an emoji">
              {EMOJIS.map((e) => {
                const selected = emoji === e
                return (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`Emoji ${e}`}
                    onClick={() => {
                      setEmoji(e)
                      clearError('form')
                    }}
                    className={`flex h-[54px] cursor-pointer items-center justify-center rounded-hype-sm border text-2xl transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hype-purple ${
                      selected
                        ? 'border-[1.5px] border-hype-purple bg-hype-purple-soft'
                        : 'border-hype-border bg-hype-surface-2 hover:border-hype-border-strong'
                    }`}
                  >
                    {e}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {/* Category */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-hype-text">Category</span>
              <span className="text-xs text-hype-text-3">(optional)</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Pick a category">
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.value}
                  small
                  active={category === c.value}
                  onClick={() => {
                    setCategory(category === c.value ? null : c.value)
                    clearError('form')
                  }}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="flex flex-col gap-3 pt-2">
            <ButtonPrimary type="submit" disabled={submitting} className="w-full !py-4 !text-base">
              {submitting ? 'Creating…' : 'Start countdown ⏳'}
            </ButtonPrimary>
            <p className="text-center text-[13px] text-hype-text-3">
              You'll get a unique link — your timer is only visible to people who have it.
            </p>
          </div>
        </form>
      </div>
    </main>
  )
}
