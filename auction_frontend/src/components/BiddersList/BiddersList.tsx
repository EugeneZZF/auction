'use client'

import { useEffect, useRef } from 'react'
import { observer } from 'mobx-react-lite'
import styles from './BiddersList.module.css'

interface BidData {
  userName: string
  timestamp: string
  isNew?: boolean
}

interface RecentBid {
  userId: string
  userName: string
  bidCount: number
  timestamp: number
}

export interface LotBidsData {
  lotId: string
  lotBids: {
    lotId: string
    totalBids: number
    currentLeader: {
      userId: string
      userName: string
      bidCount: number
    }
    recentBids: RecentBid[]
  }
  userBids: {
    lotId: string
    userBids: number
    totalBids: number
    userRank: number
  }
  newBid?: {
    userId: string
    userName: string
    bidCount: number
    timestamp: number
  }
}

interface BiddersListProps {
  lotId: string
  isConnected: boolean
  bids: BidData[]
  error: string | null
  loading: boolean
}

const BiddersList = observer(({ lotId, isConnected, bids, error, loading }: BiddersListProps) => {
  const listRef = useRef<HTMLDivElement>(null)

  // Функция для прокрутки к новой ставке (теперь к верху)
  const scrollToNewBid = () => {
    if (listRef.current) {
      listRef.current.scrollTop = 0
    }
  }

  useEffect(() => {
    // прокрутка при появлении новой ставки наверх
    if (bids && bids.length > 0 && bids[0].isNew) {
      setTimeout(scrollToNewBid, 100)
    }
  }, [bids])

  if (loading) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Участники аукциона</h3>
        <div className={styles.loading}>Загрузка участников...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <h3 className={styles.title}>Участники аукциона</h3>
        <div className={styles.error}>{error}</div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Участники аукциона</h3>
      
      {!isConnected && (
        <div className={styles.connectionWarning}>
          <p>Подключение к аукциону...</p>
        </div>
      )}

      {isConnected && (
        <div className={styles.connectionSuccess}>
          <p>✅ Подключен к аукциону</p>
        </div>
      )}
      
      {bids.length === 0 ? (
        <div className={styles.empty}>
          Пока нет участников
        </div>
      ) : (
        <div className={styles.simpleList} ref={listRef}>
          {bids.map((bid, index) => (
            <div 
              key={`${bid.userName}-${bid.timestamp}-${index}`} 
              className={`${styles.simpleItem} ${
                index === 0 ? styles.latestBid : ''
              } ${bid.isNew ? styles.newBid : ''}`}
            >
              {bid.userName}
            </div>
          ))}
        </div>
      )}

      <div className={styles.debugInfo}>
        <p>Debug: Connected: {isConnected ? 'Да' : 'Нет'}</p>
        <p>Debug: Lot ID: {lotId}</p>
        <p>Debug: Bids count: {bids.length}</p>
        <p>Debug: Latest bid: {bids[0]?.userName || 'Нет'}</p>
        <p>Debug: Bids array: {JSON.stringify(bids.map(b => b.userName))}</p>
      </div>
    </div>
  )
})

export default BiddersList 