'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { getActiveLots } from '@/utils/api'
import LotCard from '../LotCard/LotCard'
import styles from './InTrend.module.css'

import PackageCard from '@/components/PackageCard/PackageCard'
import { API_BASE_URL, backendAssetUrl } from '@/config/api'
import type { Lot } from '@/utils/api'

const packages = [
  { img: 'p10.png', name: 'Пакет ставок 10 штук', qtt: 10 },
  { img: 'p25.png', name: 'Пакет ставок 25 штук', qtt: 25  },
  { img: 'p50.png', name: 'Пакет ставок 50 штук', qtt: 50  },
  { img: 'p100.png', name: 'Пакет ставок 100 штук', qtt: 100  }
]

type TimerItem = {
  lotId: string
  title: string
  isActive?: boolean
  inactivityEndsAt: number | null
  msLeft: number | null
  // метаданные для UI
  updatedAt?: number
  source?: 'snapshot' | 'update'
}

type TimersResponse = {
  timers: TimerItem[]
}

const InTrend = () => {
  const [apiLots, setApiLots] = useState<Lot[]>([])
  const [timersMap, setTimersMap] = useState<Record<string, TimerItem>>({})
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    let cancelled = false
    const refreshLots = () => getActiveLots()
      .then((lots) => {
        if (!cancelled) setApiLots(lots.filter((lot) => lot.isActive && !lot.isFinished))
      })
      .catch((error: unknown) => {
        console.error('Не удалось загрузить лоты', error)
      })

    void refreshLots()
    const refreshInterval = setInterval(() => void refreshLots(), 10_000)

    return () => {
      cancelled = true
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    const socketUrl = `${API_BASE_URL}/public`
    console.log('🧩 InTrend: Инициализация публичного Socket.IO', { socketUrl })

    // Публичное подключение без токена
    const socket = io(socketUrl, { transports: ['websocket'] })

    const applySnapshot = (resp: TimersResponse) => {
      const count = Array.isArray(resp?.timers) ? resp.timers.length : 0
      console.log('🧩 InTrend: Получен снимок таймеров', { count, sample: resp?.timers?.slice(0, 3) })
      if (resp && Array.isArray(resp.timers)) {
        const now = Date.now()
        setTimersMap(() => {
          const next: Record<string, TimerItem> = {}
          for (const t of resp.timers) {
            next[t.lotId] = { ...t, updatedAt: now, source: 'snapshot' }
          }
          console.log('🧩 InTrend: Применили снимок таймеров', { keys: Object.keys(next).length })
          return next
        })
      }
    }

    socket.on('connect', () => {
      console.log('🧩 InTrend: Socket подключен', { id: socket.id })
      // начальный снимок
      socket.emit('getLotsTimers', { includeInactive: false }, (resp: TimersResponse) => {
        applySnapshot(resp)
      })
    })

    // пуш-обновления таймеров
    const onTimerUpdate = (data: TimerItem) => {
      console.log('🧩 InTrend: timer update', data)
      if (!data?.lotId) return
      const stamp = Date.now()
      setTimersMap(prev => ({
        ...prev,
        [data.lotId]: {
          ...(prev[data.lotId] || { lotId: data.lotId, title: data.title, inactivityEndsAt: null, msLeft: null }),
          ...data,
          updatedAt: stamp,
          source: 'update'
        }
      }))
    }

    socket.on('lotTimerUpdate', onTimerUpdate)

    socket.on('disconnect', (reason) => {
      console.warn('🧩 InTrend: Socket отключен', { reason })
    })

    socket.on('connect_error', (error) => {
      console.error('🧩 InTrend: Ошибка подключения сокета', { message: error.message })
    })

    socketRef.current = socket

    return () => {
      console.log('🧩 InTrend: Очистка — отписка от lotTimerUpdate и отключение сокета')
      if (socketRef.current) {
        socketRef.current.off('lotTimerUpdate', onTimerUpdate)
        socketRef.current.disconnect()
      }
      socketRef.current = null
    }
  }, [])

  return (
    <section className={styles.inTrend}>
        <div className={styles.header}>
            <h1>В тренде</h1>
        </div>
        <div className={styles.gridContainer}>
        {packages.map((pkg, index) => (
            <PackageCard 
              key={index} 
              imgSrc={backendAssetUrl(pkg.img)}
              name={pkg.name} 
              qtt={pkg.qtt}
            />
        ))}
        {apiLots.map((lot) => {
          const timer = timersMap[lot.id]
          const endsAt = (() => {
            let source: 'inactivityEndsAt' | 'msLeft' | 'fallback' = 'fallback'
            let value: Date
            if (timer) {
              if (typeof timer.inactivityEndsAt === 'number') {
                source = 'inactivityEndsAt'
                value = new Date(timer.inactivityEndsAt)
              } else if (typeof timer.msLeft === 'number') {
                source = 'msLeft'
                value = new Date(Date.now() + timer.msLeft)
              } else {
                value = new Date(lot.currentEnd)
              }
            } else {
              value = new Date(lot.currentEnd)
            }
            console.debug('🧩 InTrend: Выбор endsAt для лота', { lotId: lot.id, source, endsAtISO: value.toISOString(), timer })
            return value
          })()

          const flashAt = timer?.source === 'update' ? (timer.updatedAt ?? Date.now()) : undefined

          return (
            <LotCard 
              key={lot.id} 
              id={lot.id}
              imgSrc={backendAssetUrl(lot.image)}
              name={lot.title} 
              description={lot.description}
              startPriceKopecks={lot.basePrice}
              endsAt={endsAt}
              flashAt={flashAt}
            />
          )
        })}
        </div>
    </section>
  )
}

export default InTrend
