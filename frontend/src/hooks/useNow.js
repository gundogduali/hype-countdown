import { useEffect, useState } from 'react'
import { serverNow } from '../lib/time'

/**
 * Server-offset "now" (ms epoch) that ticks aligned to the second boundary.
 * Does not tick while `active=false` (e.g. while data is loading).
 */
export default function useNow(active = true) {
  const [now, setNow] = useState(() => serverNow())

  useEffect(() => {
    if (!active) return undefined
    let timer
    const schedule = () => {
      timer = setTimeout(() => {
        setNow(serverNow())
        schedule()
      }, 1000 - (serverNow() % 1000) + 20)
    }
    setNow(serverNow())
    schedule()
    return () => clearTimeout(timer)
  }, [active])

  return now
}
