import { io } from 'socket.io-client'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

// A split deployment (static frontend + separate API host) must reach the socket on the API
// origin; a relative base keeps the same-origin behavior used by the dev proxy.
function socketOrigin() {
  try {
    return new URL(API_BASE).origin
  } catch {
    return undefined
  }
}

let socket = null

export function getRealtimeSocket() {
  if (!socket) {
    socket = io(socketOrigin(), {
      path: '/socket.io',
      withCredentials: true,
      autoConnect: true,
      transports: ['websocket', 'polling'],
    })
  }
  return socket
}

/**
 * Sends a chat turn over the WebSocket when it is connected, so the message never needs a
 * separate HTTP round trip. Rejects with `fallback: true` when the socket is unavailable.
 */
export function sendChatMessageRealtime({ owner, repo, message }) {
  const active = getRealtimeSocket()
  if (!active.connected) {
    return Promise.reject(
      Object.assign(new Error('Chat socket is not connected.'), { fallback: true }),
    )
  }

  return new Promise((resolve, reject) => {
    active
      .timeout(120_000)
      .emit('chat:send', { owner, repo, message }, (timeoutError, response) => {
        if (timeoutError) {
          reject(
            Object.assign(new Error('The chat connection timed out. Please retry.'), {
              fallback: true,
            }),
          )
          return
        }
        if (!response?.ok) {
          reject(
            Object.assign(
              new Error(response?.error?.message || 'The message could not be processed.'),
              {
                code: response?.error?.code || 'REQUEST_FAILED',
                details: response?.error?.details,
              },
            ),
          )
          return
        }
        resolve(response.data)
      })
  })
}
