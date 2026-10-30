'use client'

import { useState } from 'react'
import { observer } from 'mobx-react-lite'
import { userStore } from '@/stores/userStore'
import { buyBid } from '@/utils/api'
import styles from './PackageCard.module.css'

interface PackageCardProps {
  imgSrc: string
  name: string
  qtt: number
  onBuy?: () => void
}

const PackageCard = observer(({ imgSrc, name, qtt, onBuy }: PackageCardProps) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleBuy = async () => {
    if (!userStore.isAuthenticated) {
      setError('Необходима авторизация')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await buyBid(qtt)
      
      // Обновляем данные пользователя в store
      userStore.setUser({
        user: {
          id: response.id,
          email: response.email,
          name: response.name,
          balance: response.balance,
          bids: response.bids,
        },
        accessToken: userStore.accessToken!,
        refreshToken: userStore.refreshToken!,
      })

      // Вызываем callback если он передан
      onBuy?.()
      
      console.log(`Куплено ${qtt} ставок`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка покупки ставок')
      console.error('Ошибка покупки ставок:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.card}>
      <div className={styles.img_wrapper}>
        <img src={imgSrc} alt={name} className={styles.image} />
      </div>
      <div className={styles.name}>{name}</div>
      {error && <div className={styles.error}>{error}</div>}
      <button 
        className={styles.button} 
        onClick={handleBuy}
        disabled={loading || !userStore.isAuthenticated}
      >
        {loading ? 'Покупка...' : 'Купить'}
      </button>
    </div>
  )
})

export default PackageCard
