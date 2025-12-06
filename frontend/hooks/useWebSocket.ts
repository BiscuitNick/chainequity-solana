/**
 * WebSocket hook for real-time updates
 */
import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws'

export type WebSocketChannel =
  | 'transactions'
  | 'allowlist'
  | 'transfers'
  | 'vesting'
  | 'dividends'
  | 'governance'
  | 'multisig'

interface WebSocketMessage {
  type: string
  event_type?: string
  channel?: string
  token_id?: string
  data?: any
  timestamp?: string
}

interface UseWebSocketOptions {
  channels?: WebSocketChannel[]
  tokenId?: string
  onMessage?: (message: WebSocketMessage) => void
  autoConnect?: boolean
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    channels = [],
    tokenId,
    onMessage,
    autoConnect = true,
  } = options

  const [isConnected, setIsConnected] = useState(false)
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)

    ws.onopen = () => {
      setIsConnected(true)
      console.log('WebSocket connected')

      // Subscribe to channels
      if (channels.length > 0) {
        ws.send(JSON.stringify({
          type: 'subscribe',
          channels,
          token_id: tokenId,
        }))
      }
    }

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data)
        setLastMessage(message)
        onMessage?.(message)
      } catch (e) {
        console.error('Failed to parse WebSocket message', e)
      }
    }

    ws.onclose = () => {
      setIsConnected(false)
      console.log('WebSocket disconnected')

      // Auto-reconnect after 5 seconds
      if (autoConnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...')
          connect()
        }, 5000)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error', error)
    }

    wsRef.current = ws
  }, [channels, tokenId, onMessage, autoConnect])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
    }
    wsRef.current?.close()
    wsRef.current = null
  }, [])

  const subscribe = useCallback((newChannels: WebSocketChannel[], newTokenId?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'subscribe',
        channels: newChannels,
        token_id: newTokenId,
      }))
    }
  }, [])

  const unsubscribe = useCallback((channelsToRemove: WebSocketChannel[], tokenIdToRemove?: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'unsubscribe',
        channels: channelsToRemove,
        token_id: tokenIdToRemove,
      }))
    }
  }, [])

  const ping = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }
  }, [])

  // Connect on mount
  useEffect(() => {
    if (autoConnect) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [autoConnect, connect, disconnect])

  // Update subscriptions when channels or tokenId change
  useEffect(() => {
    if (isConnected && channels.length > 0) {
      subscribe(channels, tokenId)
    }
  }, [isConnected, channels, tokenId, subscribe])

  return {
    isConnected,
    lastMessage,
    connect,
    disconnect,
    subscribe,
    unsubscribe,
    ping,
  }
}

// Specialized hooks for specific event types
export function useTransferEvents(tokenId?: string, onTransfer?: (data: any) => void) {
  return useWebSocket({
    channels: ['transfers'],
    tokenId,
    onMessage: (msg) => {
      if (msg.event_type === 'tokens_transferred') {
        onTransfer?.(msg.data)
      }
    },
  })
}

export function useVestingEvents(tokenId?: string, onVestingEvent?: (data: any) => void) {
  return useWebSocket({
    channels: ['vesting'],
    tokenId,
    onMessage: (msg) => {
      if (msg.channel === 'vesting') {
        onVestingEvent?.(msg.data)
      }
    },
  })
}

export function useGovernanceEvents(tokenId?: string, onGovernanceEvent?: (data: any) => void) {
  return useWebSocket({
    channels: ['governance'],
    tokenId,
    onMessage: (msg) => {
      if (msg.channel === 'governance') {
        onGovernanceEvent?.(msg.data)
      }
    },
  })
}
