'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { observer } from 'mobx-react-lite'
import { userStore } from '@/stores/userStore'
import { API_BASE_URL, backendAssetUrl } from '@/config/api'
import { refreshAccessToken } from '@/handlers/jwt_handler'
import { getLotById, Lot } from '@/utils/api'
import BiddersList, { LotBidsData } from '@/components/BiddersList/BiddersList'
import BidForm from '@/components/BidForm/BidForm'
import styles from './page.module.css'
import { io, Socket } from 'socket.io-client'
import AutoBet from '@/components/AutoBet/AutoBet'
import { ConfettiOverlay } from '@/components/ConfetiOverlay/ConfetiOverlay'

const LotPage = observer(() => {
  const params = useParams()
  const [lot, setLot] = useState<Lot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeParts, setTimeParts] = useState<{ mm: string; ss: string }>({ mm: '00', ss: '00' })
  const [endTimeMs, setEndTimeMs] = useState<number | null>(null)
  const [socketConnected, setSocketConnected] = useState(false)
  const [bidError, setBidError] = useState<string | null>(null)
  const [bidSuccess, setBidSuccess] = useState(false)
  const [placingBid, setPlacingBid] = useState(false)
  const [bids, setBids] = useState<{ userName: string; timestamp: string; isNew?: boolean }[]>([])
  const [autoBidEnabled, setAutoBidEnabled] = useState(false)
  const [autoBidMaxBids, setAutoBidMaxBids] = useState<number | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const lastNewBidTsRef = useRef<number | null>(null)
  const lastHeadKeyRef = useRef<string | null>(null)
  const inactivityMsRef = useRef<number>(0)
  const [flashAt, setFlashAt] = useState<number | null>(null)
  const [flash, setFlash] = useState<boolean>(false)
  const [winner, setWinner] = useState<boolean>(false)
  
  // Отладочный лог для отслеживания изменений winner
  useEffect(() => {
    if (winner) {
      console.log('🎉 LotPage: Пользователь выиграл! Показываем конфетти')
    } else {
      console.log('🏆 LotPage: winner state changed to:', winner)
    }
  }, [winner])

  const lotId = params.id as string

  useEffect(() => {
    const fetchLot = async () => {
      try {
        setLoading(true)
        setError(null)
        const lotData = await getLotById(lotId)
        setLot(lotData)
        // устанавливаем начальное время окончания по inactivityEndsAt (ISO)
        let initialEnd = new Date(lotData.inactivityEndsAt).getTime()
        if (!Number.isFinite(initialEnd) || initialEnd <= Date.now()) {
          const delta = lotData.inactivityTimeoutMs ?? 0
          initialEnd = Date.now() + delta
        }
        setEndTimeMs(initialEnd)
        inactivityMsRef.current = lotData.inactivityTimeoutMs ?? 0
        lastNewBidTsRef.current = null
        lastHeadKeyRef.current = null
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Ошибка загрузки лота')
        console.error('Ошибка загрузки лота:', err)
      } finally {
        setLoading(false)
      }
    }

    if (lotId) {
      fetchLot()
    }
  }, [lotId])

  // синхронизируем актуальное значение inactivityTimeoutMs в ref, чтобы не ловить устаревшие замыкания
  useEffect(() => {
    if (lot?.inactivityTimeoutMs !== undefined && lot?.inactivityTimeoutMs !== null) {
      inactivityMsRef.current = lot.inactivityTimeoutMs
    }
  }, [lot?.inactivityTimeoutMs])

  useEffect(() => {
    if (!endTimeMs) return
    const interval = setInterval(() => {
      const now = Date.now()
      const rawDiff = endTimeMs - now
      const diff = Math.max(0, rawDiff)
      if (diff <= 0) {
        setTimeParts({ mm: '00', ss: '00' })
        // Автоматически отключаем автоставки при окончании времени
        if (autoBidEnabled) {
          console.log('⏰ LotPage: Время истекло, отключаем автоставки')
          setAutoBidEnabled(false)
          setAutoBidMaxBids(null)
          userStore.disableAutoBid(lotId)
          // Уведомляем сервер об отключении автоставки
          if (socketRef.current?.connected) {
            socketRef.current.emit('disableAutoBid', { lotId })
          }
        }
        clearInterval(interval)
        return
      }
      const minutes = Math.floor(diff / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeParts({
        mm: minutes.toString().padStart(2, '0'),
        ss: seconds.toString().padStart(2, '0'),
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [endTimeMs, autoBidEnabled, lotId])

  // Подписываемся на уведомления об отключении автоставок
  useEffect(() => {
    if (!lotId) return

    const handleAutoBidDisabled = () => {
      console.log('🔄 LotPage: Получено уведомление об отключении автоставки', { lotId })
      setAutoBidEnabled(false)
      setAutoBidMaxBids(null)
    }

    // Подписываемся на уведомления
    userStore.onAutoBidDisabled(lotId, handleAutoBidDisabled)

    // Отписываемся при размонтировании
    return () => {
      userStore.offAutoBidDisabled(lotId, handleAutoBidDisabled)
    }
  }, [lotId])

  useEffect(() => {
    if (typeof flashAt === 'number') {
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 600)
      return () => clearTimeout(t)
    }
  }, [flashAt])

  type ViewBid = { userName: string; timestamp: string; isNew?: boolean }
  type SocketErrorPayload = { message?: string; code?: string }
  type SocketBidResult = { success: boolean; message?: string; userBids?: number; userBalance?: number }


  // Инициализация единственного сокет-подключения и подписок
  useEffect(() => {
    if (!lotId) return
    if (!userStore.isAuthenticated || !userStore.accessToken) return

    if (socketRef.current && socketRef.current.connected) return

    const socketUrl = API_BASE_URL
    console.log('🔧 LotPage: Инициализация Socket.IO', {
      socketUrl,
      lotId,
      hasToken: !!userStore.accessToken,
    })
    const newSocket = io(socketUrl, {
      auth: { token: userStore.accessToken },
      timeout: 5000,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    })

    // Общий обработчик всех событий для отладки
    newSocket.onAny((eventName, ...args) => {
      console.log('🔍 LotPage:onAny →', eventName, args)
    })

    newSocket.on('lotClosed', (data: { winner?: { userId: string } }) => {
      console.log('🏁 LotPage: Получено событие lotClosed', data)
      setLot((currentLot) => currentLot ? { ...currentLot, isActive: false } : currentLot)
      setAutoBidEnabled(false)
      setAutoBidMaxBids(null)
      console.log('🏁 LotPage: Проверяем победителя', {
        winnerUserId: data?.winner?.userId,
        currentUserId: userStore.user?.id,
        isWinner: data?.winner?.userId === userStore.user?.id,
        userStore: userStore.user
      })
      
      if (data?.winner?.userId === userStore.user?.id) {
        console.log('🏁 LotPage: Пользователь выиграл лот! Устанавливаем winner = true', data)
        setWinner(true)
        // Увеличиваем время показа конфетти до 10 секунд
        setTimeout(() => {
          console.log('🏁 LotPage: Сбрасываем winner = false')
          setWinner(false)
        }, 10000)
      } else {
        console.log('🏁 LotPage: Пользователь не выиграл лот')
      }
    })

    newSocket.on('connect', () => {
      console.log('✅ LotPage: Подключено к аукциону', { socketId: newSocket.id })
      setSocketConnected(true)
      setBidError(null)
      console.log('🔧 LotPage: Подписываемся на лот', { lotId })
      newSocket.emit('subscribeToLot', { lotId })

      // Получаем текущие включённые автоставки и синхронизируем состояние для этого лота
      newSocket.emit('listAutoBids', undefined, (res: { lots?: string[]; lotDetails?: { [lotId: string]: { maxBids: number } } }) => {
        const enabled = Array.isArray(res?.lots) && res!.lots!.includes(lotId)
        setAutoBidEnabled(!!enabled)
        
        // Получаем информацию о лимите ставок для текущего лота
        if (enabled && res?.lotDetails?.[lotId]?.maxBids) {
          setAutoBidMaxBids(res.lotDetails[lotId].maxBids)
          // Синхронизируем с userStore
          userStore.setAutoBid(lotId, true, res.lotDetails[lotId].maxBids)
        } else {
          setAutoBidMaxBids(null)
          // Синхронизируем с userStore
          userStore.disableAutoBid(lotId)
        }
        
        console.log('⚙️ LotPage: listAutoBids →', res)
      })
    })
    // Слушаем подтверждение изменения статуса автоставки
    newSocket.on('autoBidUpdated', ({ lotId: updatedLotId, enabled, maxBids }: { lotId: string; enabled: boolean; maxBids?: number }) => {
      if (updatedLotId === lotId) {
        setAutoBidEnabled(enabled)
        setAutoBidMaxBids(enabled ? maxBids || null : null)
        // Синхронизируем с userStore
        userStore.setAutoBid(lotId, enabled, maxBids || undefined)
        console.log('🔁 LotPage: autoBidUpdated →', { lotId: updatedLotId, enabled, maxBids })
      }
    })

    // Слушаем событие окончания лота
    newSocket.on('lotFinished', ({ lotId: finishedLotId }: { lotId: string }) => {
      if (finishedLotId === lotId) {
        console.log('🏁 LotPage: Лот завершен, отключаем автоставки', { lotId: finishedLotId })
        // Отключаем автоставку локально
        setAutoBidEnabled(false)
        setAutoBidMaxBids(null)
        // Отключаем автоставку в userStore
        userStore.disableAutoBid(lotId)
        // Показываем уведомление пользователю
        setBidSuccess(true)
        setTimeout(() => setBidSuccess(false), 5000)
      }
    })

    newSocket.on('disconnect', () => {
      console.log('❌ LotPage: Отключено от аукциона')
      setSocketConnected(false)
    })

    newSocket.on('connect_error', (err) => {
      console.error('❌ LotPage: Ошибка подключения', err)
      setSocketConnected(false)
      setBidError(`Ошибка подключения к аукциону: ${err.message}`)
    })

    // Обновление ленты ставок
    newSocket.on('lotBidsUpdate', (data: LotBidsData) => {
      console.log('📊 LotPage: lotBidsUpdate', {
        hasLotBids: !!data?.lotBids,
        recentCount: data?.lotBids?.recentBids?.length,
        hasNewBid: !!data?.newBid,
        payload: data,
      })
      // Продлеваем таймер при наличии признака новой ставки (без проверок на дубликаты)
      if (data?.newBid) {
        const delta = Math.max(0, inactivityMsRef.current)
        const next = Date.now() + delta
        setEndTimeMs(next)
        setFlashAt(Date.now())
        console.log('⏱️ LotPage: lotBidsUpdate → deadline = now + inactivityTimeoutMs:', delta, '→', new Date(next).toISOString())
        lastNewBidTsRef.current = Date.now()
      }
      // Фолбэк: если сервер не присылает newBid, смотрим голову recentBids
      const head = data?.lotBids?.recentBids?.[0]
      if (head) {
        const headKey = `${head.userName}|${head.timestamp}`
        if (lastHeadKeyRef.current !== headKey) {
          const delta = inactivityMsRef.current
          console.log('⏱️ LotPage: Fallback по голове recentBids', {
            prevHeadKey: lastHeadKeyRef.current,
            newHeadKey: headKey,
            head,
            delta,
          })
          if (delta > 0) {
            setEndTimeMs(() => Date.now() + delta)
            console.log('⏱️ LotPage: Установили новый дедлайн (head change) = now +', delta, 'мс')
            setFlashAt(Date.now())
          }
          lastHeadKeyRef.current = headKey
          lastNewBidTsRef.current = head.timestamp
        }
      }
      if (data?.lotBids?.recentBids) {
        const list: ViewBid[] = data.lotBids.recentBids
          .map((b) => ({ userName: b.userName, timestamp: new Date(b.timestamp).toISOString() }))
          .sort((a: ViewBid, b: ViewBid) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

        // берём только последние 100 (самые новые в начале)
        const capped = list.slice(0, 100)

        if (data.newBid && capped.length > 0) {
          // помечаем первый элемент как новый для анимации
          capped[0].isNew = true
          console.log('🎯 LotPage: Помечаем новую ставку как isNew для', capped[0])
          setTimeout(() => {
            setBids((current) => current.map((bid, i) => (i === 0 ? { ...bid, isNew: false } : bid)))
          }, 3000)
        }
        console.log('📊 LotPage: Устанавливаем bids из lotBidsUpdate (capped=100)', capped)
        setBids(capped)
      }
    })



    // Результат размещения ставки
    newSocket.on('bidResult', (data: SocketBidResult) => {
      console.log('✅ LotPage: bidResult', data)
      if (data?.success) {
        setBidSuccess(true)
        setPlacingBid(false)
        if (userStore.user && (data.userBids !== undefined || data.userBalance !== undefined)) {
          console.log('🔄 LotPage: Обновляем пользователя по данным bidResult', {
            prev: userStore.user,
            nextBids: data.userBids,
            nextBalance: data.userBalance,
          })
          userStore.setUser({
            user: {
              ...userStore.user,
              bids: data.userBids !== undefined ? data.userBids : userStore.user.bids,
              balance: data.userBalance !== undefined ? data.userBalance : userStore.user.balance,
            },
            accessToken: userStore.accessToken!,
            refreshToken: userStore.refreshToken!,
          })
        } else if (userStore.user) {
          console.log('🔄 LotPage: Данных по пользователю нет, уменьшаем bids на 1')
          userStore.setUser({
            user: { ...userStore.user, bids: userStore.user.bids - 1 },
            accessToken: userStore.accessToken!,
            refreshToken: userStore.refreshToken!,
          })
        }
        setTimeout(() => setBidSuccess(false), 3000)
      } else {
        console.warn('⚠️ LotPage: bidResult неуспешный', data)
        setBidError(data?.message || 'Ошибка размещения ставки')
        setPlacingBid(false)
      }
    })

    // Слушаем обновления баланса конкретного пользователя
    newSocket.on('userBalanceUpdated', (data: { userId: string; balance: number; bids: number; timestamp: number }) => {
      console.log('💰 LotPage: userBalanceUpdated', data)
      // Обновляем баланс и ставки через userStore
      userStore.handleUserBalanceUpdate(data)
    })

    // Слушаем все ставки на лоте (включая автоставки)
    newSocket.on('bidPlaced', (data: { 
      lotId: string; 
      lotBids: unknown; 
      newBid: { userId: string; userName: string; bidCount: number; timestamp: number }; 
      userBalanceUpdate?: { userId: string; balance: number; bids: number } 
    }) => {
      console.log('🎯 LotPage: bidPlaced (новый формат)', data)
      
      // Если это ставка текущего пользователя, обновляем баланс
      if (data.userBalanceUpdate && data.userBalanceUpdate.userId === userStore.user?.id) {
        console.log('🔄 LotPage: Обновляем баланс по bidPlaced', data.userBalanceUpdate)
        userStore.updateUserData(data.userBalanceUpdate.balance, data.userBalanceUpdate.bids)
      }
      
      // Обновляем состояние лота (если нужно)
      if (data.lotBids) {
        // Здесь можно обновить состояние лота, если необходимо
        console.log('📊 LotPage: Обновлены данные лота', data.lotBids)
      }
      
      // Продлеваем таймер при наличии новой ставки
      if (data.newBid) {
        const delta = Math.max(0, inactivityMsRef.current)
        const next = Date.now() + delta
        setEndTimeMs(next)
        setFlashAt(Date.now())
        console.log('⏱️ LotPage: bidPlaced → deadline = now + inactivityTimeoutMs:', delta, '→', new Date(next).toISOString())
        lastNewBidTsRef.current = Date.now()
      }
      
      // Обновляем список ставок
      if (data.newBid?.userName) {
        const newBid = {
          userName: data.newBid.userName,
          timestamp: new Date(data.newBid.timestamp).toISOString(),
          isNew: true,
        }
        setBids((prev) => {
          const updated = [newBid, ...prev]
          const capped = updated.slice(0, 100)
          console.log('🎯 LotPage: Обновленный список после bidPlaced (capped=100)', capped)
          setTimeout(() => {
            setBids((current) => current.map((bid, i) => (i === 0 ? { ...bid, isNew: false } : bid)))
          }, 3000)
          return capped
        })
      }
    })

    newSocket.on('error', (data: SocketErrorPayload) => {
      console.error('❌ LotPage: socket error', data)
      setBidError(data?.message || 'Ошибка')
      if (userStore.refreshToken && data?.code === 'TOKEN_EXPIRED') {
        void refreshAccessToken().then((refreshed) => {
          if (refreshed && userStore.accessToken) {
            setBidError(null)
            newSocket.auth = { token: userStore.accessToken }
            newSocket.connect()
          }
        }).catch((err) => {
          console.error('❌ LotPage: Ошибка обновления токена', err)
          setBidError('Ошибка обновления токена')
        })
      }
      setPlacingBid(false)
    })

    socketRef.current = newSocket
    return () => {
      console.log('🔧 LotPage: Отключаем Socket.IO')
      newSocket.off('autoBidUpdated')
      newSocket.off('lotFinished')
      if (newSocket && newSocket.connected) {
        console.log('🔧 LotPage: Отписываемся от лота', { lotId })
        newSocket.emit('unsubscribeFromLot', { lotId })
      }
      newSocket.disconnect()
      socketRef.current = null
    }
  }, [lotId])

  const handlePlaceBid = useCallback(() => {
    if (!userStore.isAuthenticated) {
      setBidError('Необходима авторизация для размещения ставок')
      return
    }
    if (!userStore.user?.bids || userStore.user.bids <= 0) {
      setBidError('У вас нет доступных ставок. Купите ставки для участия в аукционе.')
      return
    }
    if (!socketRef.current || !socketRef.current.connected) {
      setBidError('Нет подключения к аукциону. Попробуйте обновить страницу.')
      return
    }
    console.log('📝 LotPage: Отправляем placeBid', {
      lotId,
      bidCount: 1,
      socketId: socketRef.current.id,
      connected: socketRef.current.connected,
    })
    // Оптимистично продлеваем таймер у текущего клиента
    if (lot?.inactivityTimeoutMs) {
      setEndTimeMs(() => Date.now() + lot.inactivityTimeoutMs)
      setFlashAt(Date.now())
      console.log('⏱️ LotPage: Оптимистично установили новый дедлайн = now +', lot.inactivityTimeoutMs, 'мс')
    }
    setPlacingBid(true)
    setBidError(null)
    setBidSuccess(false)
    socketRef.current.emit('placeBid', { lotId, bidCount: 1 })
  }, [lotId])

  const handleToggleAutoBid = useCallback((maxBids?: number) => {
    if (!userStore.isAuthenticated || !userStore.accessToken) {
      setBidError('Необходима авторизация для автоставки')
      return
    }
    
    // Проверяем, есть ли у пользователя ставки
    if (userStore.userBids <= 0) {
      setBidError('У вас нет доступных ставок для автоставки. Купите ставки для участия в аукционе.')
      return
    }
    
    const socket = socketRef.current
    if (!socket || !socket.connected) {
      setBidError('Нет подключения к аукциону. Попробуйте обновить страницу.')
      return
    }
    
    if (autoBidEnabled) {
      // Отключаем автоставку
      setAutoBidEnabled(false)
      setAutoBidMaxBids(null)
      // Синхронизируем с userStore
      userStore.disableAutoBid(lotId)
      console.log('📝 LotPage: Отключаем автоставку', { lotId })
      socket.emit('disableAutoBid', { lotId }, (res: { success?: boolean; error?: string }) => {
        console.log('🧾 LotPage: Ack по отключению автоставки', res)
        if (res?.success) {
          // оставляем как есть; сервер дополнительно пришлет autoBidUpdated
        } else if (res?.error) {
          setBidError(res.error)
          // Откатываем оптимистичное изменение
          setAutoBidEnabled(true)
          setAutoBidMaxBids(autoBidMaxBids)
          userStore.setAutoBid(lotId, true, autoBidMaxBids || undefined)
        }
      })
    } else {
      // Включаем автоставку с лимитом
      if (!maxBids || maxBids <= 0) {
        setBidError('Необходимо указать лимит ставок для автоставки')
        return
      }
      
      // Проверяем, что лимит не превышает доступные ставки
      if (maxBids > userStore.userBids) {
        setBidError(`Лимит ставок (${maxBids}) не может превышать количество доступных ставок (${userStore.userBids})`)
        return
      }
      
      setAutoBidEnabled(true)
      setAutoBidMaxBids(maxBids)
      // Синхронизируем с userStore
      userStore.setAutoBid(lotId, true, maxBids)
      console.log('📝 LotPage: Включаем автоставку', { lotId, maxBids })
      socket.emit('enableAutoBid', { lotId, maxBids }, (res: { success?: boolean; error?: string }) => {
        console.log('🧾 LotPage: Ack по включению автоставки', res)
        if (res?.success) {
          // оставляем как есть; сервер дополнительно пришлет autoBidUpdated
        } else if (res?.error) {
          setBidError(res.error)
          // Откатываем оптимистичное изменение
          setAutoBidEnabled(false)
          setAutoBidMaxBids(null)
          userStore.disableAutoBid(lotId)
        }
      })
    }
  }, [autoBidEnabled, autoBidMaxBids, lotId])

  if (loading) {
    return (
      <>
        <div className={styles.container}>
          <div className={styles.loading}>Загрузка лота...</div>
        </div>
      </>
    )
  }

  if (error || !lot) {
    return (
      <>
        <div className={styles.container}>
          <div className={styles.error}>
            {error || 'Лот не найден'}
          </div>
        </div>
      </>
    )
  }

  return (
      <>
      {winner && (
        <ConfettiOverlay active={true}/>
      )}
      <div className={styles.container}>
        <div className={styles.lotCard}>
          <div className={styles.imageSection}>
            <img 
              src={backendAssetUrl(lot.image)}
              alt={lot.title}
              className={styles.image}
            />
          </div>
          
          <div className={styles.infoSection}>
            <h1 className={styles.title}>{lot.title}</h1>
            
            {lot.description && (
              <p className={styles.description}>{lot.description}</p>
            )}
            
            <div className={styles.timerSection}>
              <h3>{lot.isActive ? 'Время до окончания:' : 'Торги завершены'}</h3>
              {lot.isActive && (
              <div className={`${styles.timer} ${flash ? styles.timerFlash : ''}`}>
                <div className={styles.timerPart}>
                  <div className={styles.timerValue}>{timeParts.mm}</div>
                  <div className={styles.timerLabel}>минуты</div>
                </div>
                <div className={styles.timerPart}>
                  <div className={styles.timerValue}>{timeParts.ss}</div>
                  <div className={styles.timerLabel}>секунды</div>
                </div>
              </div>
              )}
            </div>
            
            {userStore.isAuthenticated ? (
              <div className={styles.userInfo}>
                <p>Ваш баланс: {userStore.user?.balance || 0} ₽</p>
                <p>Ваши ставки: {userStore.user?.bids || 0}</p>
              </div>
            ) : (
              <div className={styles.authMessage}>
                <p>Для участия в аукционе необходимо авторизоваться</p>
              </div>
            )}
            
            {lot.isActive && <BidForm
              isConnected={socketConnected}
              loading={placingBid}
              error={bidError}
              success={bidSuccess}
              onPlaceBid={handlePlaceBid}
            />}
            {lot.isActive && <AutoBet 
              enabled={autoBidEnabled} 
              onToggle={handleToggleAutoBid} 
              currentMaxBids={autoBidMaxBids}
              lotFinished={timeParts.mm === '00' && timeParts.ss === '00'}
              userBids={userStore.userBids}
            />}
            <BiddersList
              lotId={lotId}
              isConnected={socketConnected}
              bids={bids}
              error={null}
              loading={false}
            />
          </div>
        </div>
      </div>
    </>
  )
})

export default LotPage 
