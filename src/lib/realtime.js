import { io } from 'socket.io-client'

let socket = null

export function getRealtimeSocket() {
  if (!socket) {
    socket = io({
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
