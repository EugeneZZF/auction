'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { observer } from 'mobx-react-lite'
import { userStore } from '@/stores/userStore'
import styles from './LotCard.module.css'

interface LotCardProps {
  id: string
  imgSrc?: string | null
  name: string
  description?: string | null
  startPriceKopecks?: number
  endsAt: Date
  flashAt?: number
}

const formatPrice = (kopecks: number) => new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
}).format(kopecks / 100)

const formatTime = (milliseconds: number) => {
  const totalSeconds = Math.ceil(milliseconds / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

const LotCard = observer(({ id, imgSrc, name, description, startPriceKopecks, endsAt, flashAt }: LotCardProps) => {
  const [timeLeft, setTimeLeft] = useState(() => Math.max(0, endsAt.getTime() - Date.now()))
  const [flash, setFlash] = useState(false)
  const href = userStore.isAuthenticated ? `/lot/${id}` : '/login'

  useEffect(() => {
    const updateTimer = () => setTimeLeft(Math.max(0, endsAt.getTime() - Date.now()))
    updateTimer()
    const interval = setInterval(updateTimer, 1000)
    return () => clearInterval(interval)
  }, [endsAt])

  useEffect(() => {
    if (typeof flashAt !== 'number') return
    setFlash(true)
    const timeout = setTimeout(() => setFlash(false), 650)
    return () => clearTimeout(timeout)
  }, [flashAt])

  return (
    <article className={styles.card}>
      <Link className={styles.cardLink} href={href} aria-label={`Открыть лот: ${name}`}>
        <div className={styles.media}>
          {imgSrc ? (
            <img src={imgSrc} alt={name} className={styles.image} loading="lazy" />
          ) : (
            <div className={styles.imagePlaceholder} aria-label="Изображение лота отсутствует">
              <span>GoldenDay</span>
            </div>
          )}
          <span className={styles.liveBadge}><i /> Торги идут</span>
          <span className={`${styles.timer} ${flash ? styles.timerFlash : ''}`} aria-label="Осталось до завершения раунда">
            <span className={styles.clockIcon} aria-hidden="true">◷</span>
            {formatTime(timeLeft)}
          </span>
        </div>
        <div className={styles.content}>
          <h2 className={styles.name}>{name}</h2>
          {description && <p className={styles.description}>{description}</p>}
          <div className={styles.priceRow}>
            <span className={styles.priceLabel}>Стартовая цена</span>
            {typeof startPriceKopecks === 'number' && <strong className={styles.price}>{formatPrice(startPriceKopecks)}</strong>}
          </div>
        </div>
      </Link>
      <div className={styles.footer}>
        <span className={styles.footerHint}>{timeLeft > 0 ? 'Успейте сделать ставку' : 'Раунд завершается'}</span>
        <Link className={styles.button} href={href}>Участвовать <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  )
})

export default LotCard
