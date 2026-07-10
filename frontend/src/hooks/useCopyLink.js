import { useCallback, useEffect, useRef, useState } from 'react'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback when the Clipboard API is unavailable (http, older browsers)
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try {
      return document.execCommand('copy')
    } finally {
      ta.remove()
    }
  }
}

/**
 * "Copy link" behavior: the button label becomes '✓ Copied' for 1.5s,
 * the toast shows for 2s (design note: CREATE FLOW).
 */
export default function useCopyLink() {
  const [copied, setCopied] = useState(false)
  const [toastVisible, setToastVisible] = useState(false)
  const timers = useRef([])

  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const copy = useCallback(async (text = window.location.href) => {
    const ok = await copyText(text)
    if (!ok) return
    // On back-to-back copies, don't let stale timeouts reset the label early
    timers.current.forEach(clearTimeout)
    timers.current = []
    setCopied(true)
    setToastVisible(true)
    timers.current.push(setTimeout(() => setCopied(false), 1500))
    timers.current.push(setTimeout(() => setToastVisible(false), 2000))
  }, [])

  return { copied, toastVisible, copy }
}
