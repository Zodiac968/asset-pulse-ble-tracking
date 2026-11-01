import { useEffect, useRef, useState } from 'react'
import type { Point2D } from '@/types/room'

/**
 * Smoothly interpolates between successive position estimates. It only eases
 * toward the latest *reported* point — it never extrapolates beyond it.
 */
export function useAnimatedPoint(target: Point2D | null, durationMs = 700): Point2D | null {
  const [current, setCurrent] = useState<Point2D | null>(target)
  const currentRef = useRef<Point2D | null>(target)
  const frame = useRef<number | null>(null)

  useEffect(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    if (!target) {
      currentRef.current = null
      setCurrent(null)
      return
    }
    const from = currentRef.current
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (!from || reduce) {
      currentRef.current = target
      setCurrent(target)
      return
    }
    const start = performance.now()
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / durationMs)
      const e = 1 - Math.pow(1 - k, 3)
      const p = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e }
      currentRef.current = p
      setCurrent(p)
      if (k < 1) frame.current = requestAnimationFrame(step)
    }
    frame.current = requestAnimationFrame(step)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [target?.x, target?.y, durationMs]) // eslint-disable-line react-hooks/exhaustive-deps

  return current
}
