import { useEffect, useState } from 'react'

/**
 * Returns a debounced version of the given value.
 *
 * The returned value only updates after the specified `delay` milliseconds
 * have elapsed without any further changes to `value`.
 *
 * @param value - The raw value to debounce.
 * @param delay - Delay in milliseconds (default `300`).
 * @returns The debounced value.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debounced
}
