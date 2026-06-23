'use client';

// ============================================================================
// EstateFlow CRM — useDebounce Hook
// Debounces a value or callback by a specified delay.
// ============================================================================

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Debounces a value — returns the value only after it has stopped
 * changing for `delay` milliseconds.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounces a callback — returns a memoized function that only fires
 * after `delay` ms of inactivity.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedCallback<T extends (...args: any[]) => void>(
  callback: T,
  delay: number,
): T {
  const callbackRef = useRef(callback);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep callback ref current without re-creating the debounced function
  useEffect(() => {
    callbackRef.current = callback;
  });

  const debouncedFn = useCallback(
    (...args: any[]) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  ) as unknown as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return debouncedFn;
}
