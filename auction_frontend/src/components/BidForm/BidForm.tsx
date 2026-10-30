'use client'

import { useCallback } from 'react'
import { observer } from 'mobx-react-lite'
import { userStore } from '@/stores/userStore'
import styles from './BidForm.module.css'

interface BidFormProps {
  isConnected: boolean
  loading: boolean
  error: string | null
  success: boolean
  onPlaceBid: () => void
}

const BidForm = observer(({ isConnected, loading, error, success, onPlaceBid }: BidFormProps) => {
  const handleClick = useCallback(() => {
    onPlaceBid()
  }, [onPlaceBid])

  if (!userStore.isAuthenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.authMessage}>
          Для участия в аукциону необходимо авторизоваться
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Разместить ставку</h3>
      
      <div className={styles.userStats}>
        <div className={styles.stat}>
          <span className={styles.label}>Ваши ставки:</span>
          <span className={styles.value}>{userStore.user?.bids || 0}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.label}>Баланс:</span>
          <span className={styles.value}>{userStore.user?.balance || 0} ₽</span>
        </div>
      </div>

      {!!error && (
        <div className={styles.error}>
          {error}
        </div>
      )}

      {/* {success && (
        <div className={styles.success}>
          Ставка успешно размещена! 🎉
        </div>
      )} */}

      <button 
        className={styles.bidButton}
        onClick={handleClick}
        disabled={loading || !userStore.user?.bids || userStore.user.bids <= 0 || !isConnected}
      >
        {loading ? 'Размещение ставки...' : 'Сделать ставку'}
      </button>

      {!userStore.user?.bids || userStore.user.bids <= 0 ? (
        <div className={styles.noBids}>
          <p>У вас нет доступных ставок</p>
          <p className={styles.buyBidsHint}>
            Перейдите на главную страницу, чтобы купить ставки
          </p>
        </div>
      ) : (
        <div className={styles.bidInfo}>
          <p>Нажмите кнопку, чтобы сделать ставку</p>
          <p className={styles.bidCost}>Стоимость: 1 ставка</p>
        </div>
      )}

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
    </div>
  )
})

export default BidForm 