import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { userStore } from '@/stores/userStore'
import { API_BASE_URL } from '@/config/api'

interface UseSocketOptions {
  lotId?: string
  onConnect?: () => void
  onDisconnect?: (reason: string) => void
  onError?: (error: unknown) => void
  onLotFinished?: (lotId: string) => void
  onUserBalanceUpdated?: (data: { userId: string; balance: number; bids: number; timestamp: number }) => void
  onBidPlaced?: (data: { 
    lotId: string; 
    lotBids: unknown; 
    newBid: { userId: string; userName: string; bidCount: number; timestamp: number }; 
    userBalanceUpdate?: { userId: string; balance: number; bids: number } 
  }) => void
}

export const useSocket = (options: UseSocketOptions = {}) => {
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const { lotId, onConnect, onDisconnect, onError, onLotFinished, onUserBalanceUpdated, onBidPlaced } = options

  useEffect(() => {
    if (!userStore.isAuthenticated || !userStore.accessToken) {
      console.log('❌ Нет авторизации для Socket.IO')
      return
    }

    // Если уже есть активное подключение, не создаем новое
    if (socketRef.current && socketRef.current.connected) {
      console.log('🔧 useSocket: Уже подключен к сокету')
      return
    }

    console.log('🔧 useSocket: Начинаем подключение к Socket.IO')

    // Создаем подключение к Socket.IO
    const socketUrl = API_BASE_URL
    console.log('🔧 useSocket: Подключаемся к Socket.IO:', socketUrl)
    
    const newSocket = io(socketUrl, {
      auth: { token: userStore.accessToken },
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    })

    newSocket.on('connect', () => {
      console.log('✅ useSocket: Подключен к аукциону')
      setIsConnected(true)
      setError(null)
      
      // Подписываемся на лот если указан
      if (lotId) {
        console.log('🔧 useSocket: Подписываемся на лот:', lotId)
        newSocket.emit('subscribeToLot', { lotId })
      }
      
      onConnect?.()
    })

    // Слушаем событие окончания лота
    newSocket.on('lotFinished', ({ lotId: finishedLotId }: { lotId: string }) => {
      console.log('🏁 useSocket: Лот завершен', { lotId: finishedLotId })
      onLotFinished?.(finishedLotId)
    })

    // Слушаем обновления баланса конкретного пользователя
    newSocket.on('userBalanceUpdated', (data: { userId: string; balance: number; bids: number; timestamp: number }) => {
      console.log('💰 useSocket: userBalanceUpdated', data)
      onUserBalanceUpdated?.(data)
    })

    // Слушаем все ставки на лоте (включая автоставки)
    newSocket.on('bidPlaced', (data: { 
      lotId: string; 
      lotBids: unknown; 
      newBid: { userId: string; userName: string; bidCount: number; timestamp: number }; 
      userBalanceUpdate?: { userId: string; balance: number; bids: number } 
    }) => {
      console.log('🎯 useSocket: bidPlaced', data)
      onBidPlaced?.(data)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('❌ useSocket: Отключен от аукциона:', reason)
      setIsConnected(false)
      onDisconnect?.(reason)
    })

    newSocket.on('connect_error', (error) => {
      console.error('❌ useSocket: Ошибка подключения:', error.message)
      setError(`Ошибка подключения к аукциону: ${error.message}`)
      setIsConnected(false)
      onError?.(error)
    })

    socketRef.current = newSocket

    return () => {
      console.log('🔧 useSocket: Отключаем Socket.IO')
      if (newSocket && newSocket.connected) {
        if (lotId) {
          newSocket.emit('unsubscribeFromLot', { lotId })
        }
      }
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [lotId])

  const emit = (event: string, data: unknown) => {
    if (socketRef.current && socketRef.current.connected) {
      console.log(`🔧 useSocket: Отправляем событие ${event}:`, data)
      socketRef.current.emit(event, data)
    } else {
      console.error('❌ useSocket: Нет подключения для отправки события')
    }
  }

  const on = (event: string, callback: (...args: unknown[]) => void) => {
    if (socketRef.current) {
      socketRef.current.on(event, callback)
    }
  }

  const off = (event: string, callback?: (...args: unknown[]) => void) => {
    if (socketRef.current) {
      if (callback) {
        socketRef.current.off(event, callback)
      } else {
        socketRef.current.off(event)
      }
    }
  }

  return {
    socket: socketRef.current,
    isConnected,
    error,
    emit,
    on,
    off
  }
} 
