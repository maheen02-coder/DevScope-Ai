import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from './api.js'

const APP_NAME = 'DevScope AI'

export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : `${APP_NAME} — Repository intelligence`
  }, [title])
}

export function useDebouncedValue(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: () => api.get('/health'),
    staleTime: 60_000,
    retry: false,
  })
}

export function useUsage() {
  return useQuery({
    queryKey: ['usage'],
    queryFn: () => api.get('/dashboard/usage'),
    staleTime: 20_000,
  })
}
