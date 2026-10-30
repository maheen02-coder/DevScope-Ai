/* eslint-disable react-refresh/only-export-components -- provider and hook are intentionally co-located */
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const queryClient = useQueryClient()

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      try {
        const data = await api.get('/auth/me')
        return data.user
      } catch (error) {
        if (error?.status === 401) return null
        throw error
      }
    },
    staleTime: 30_000,
    retry: false,
  })

  useEffect(() => {
    function handleUnauthorized() {
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      })
    }
    window.addEventListener('devscope:unauthorized', handleUnauthorized)
    return () => window.removeEventListener('devscope:unauthorized', handleUnauthorized)
  }, [queryClient])

  const login = useCallback(
    async (credentials) => {
      const data = await api.post('/auth/login', credentials)
      queryClient.setQueryData(['auth', 'me'], data.user)
      queryClient.removeQueries({
        predicate: (query) => !['auth', 'health'].includes(query.queryKey[0]),
      })
      return data.user
    },
    [queryClient],
  )

  const register = useCallback(
    async (payload) => {
      const data = await api.post('/auth/register', payload)
      queryClient.setQueryData(['auth', 'me'], data.user)
      queryClient.removeQueries({
        predicate: (query) => !['auth', 'health'].includes(query.queryKey[0]),
      })
      return data.user
    },
    [queryClient],
  )

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } finally {
      queryClient.setQueryData(['auth', 'me'], null)
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      })
    }
  }, [queryClient])

  const updateUser = useCallback(
    (user) => {
      queryClient.setQueryData(['auth', 'me'], user)
    },
    [queryClient],
  )

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['auth', 'me'] })
  }, [queryClient])

  const value = useMemo(
    () => ({
      user: meQuery.data ?? null,
      isLoading: meQuery.isLoading,
      isAuthenticated: Boolean(meQuery.data),
      login,
      register,
      logout,
      updateUser,
      refresh,
    }),
    [meQuery.data, meQuery.isLoading, login, register, logout, updateUser, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
