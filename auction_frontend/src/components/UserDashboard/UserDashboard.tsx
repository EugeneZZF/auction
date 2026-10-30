'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { userStore } from '@/stores/userStore'
import { backendAssetUrl } from '@/config/api'
import {
  BidHistoryItem,
  getUserBidHistory,
  getUserProfile,
  getWins,
  GetWins,
  UserProfile,
} from '@/utils/api'
import styles from './UserDashboard.module.css'

type Section = 'profile' | 'bids' | 'wins'

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))

const formatMoney = (kopecks: number) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 2,
  }).format(kopecks / 100)

const formatBidCount = (count: number) => {
  const category = new Intl.PluralRules('ru-RU').select(count)
  const noun = category === 'one' ? 'ставка' : category === 'few' ? 'ставки' : 'ставок'
  return `${count} ${noun}`
}

export const UserDashboard = () => {
  const [section, setSection] = useState<Section>('profile')
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [bids, setBids] = useState<BidHistoryItem[]>([])
  const [wins, setWins] = useState<GetWins[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const loadDashboard = async () => {
      userStore.loadFromStorage()
      if (!userStore.isAuthenticated) {
        setError('Войдите в аккаунт, чтобы открыть личный кабинет.')
        setLoading(false)
        return
      }

      try {
        const [profileData, bidData, winData] = await Promise.all([
          getUserProfile(),
          getUserBidHistory(),
          getWins(),
        ])
        if (cancelled) return
        setProfile(profileData)
        setBids(bidData)
        setWins(winData)
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : 'Не удалось загрузить личный кабинет')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadDashboard()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return <main className={styles.wrapper}><p className={styles.message}>Загружаем личный кабинет…</p></main>
  }

  if (error) {
    return (
      <main className={styles.wrapper}>
        <div className={styles.message}>
          <p>{error}</p>
          <Link className={styles.actionLink} href="/login">Войти в аккаунт</Link>
        </div>
      </main>
    )
  }

  if (!profile) return null

  return (
    <main className={styles.wrapper}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>GoldenDay</p>
          <h1>Личный кабинет</h1>
          <p className={styles.subtitle}>Информация об аккаунте и ваших ставках</p>
        </div>
        <button className={styles.logout} onClick={() => userStore.logout()}>Выйти</button>
      </header>

      <nav className={styles.tabs} aria-label="Разделы личного кабинета">
        <button className={section === 'profile' ? styles.activeTab : styles.tab} onClick={() => setSection('profile')}>Профиль</button>
        <button className={section === 'bids' ? styles.activeTab : styles.tab} onClick={() => setSection('bids')}>История ставок <span>{bids.length}</span></button>
        <button className={section === 'wins' ? styles.activeTab : styles.tab} onClick={() => setSection('wins')}>Выигрыши <span>{wins.length}</span></button>
      </nav>

      {section === 'profile' && (
        <section className={styles.profileGrid}>
          <article className={styles.profileCard}>
            <div className={styles.avatar} aria-hidden="true">{profile.name.trim().charAt(0).toLocaleUpperCase('ru-RU') || 'П'}</div>
            <div>
              <p className={styles.eyebrow}>Ваш аккаунт</p>
              <h2>{profile.name}</h2>
              <p className={styles.email}>{profile.email}</p>
            </div>
          </article>
          <article className={styles.statsCard}>
            <div><span>Баланс</span><strong>{formatMoney(profile.balance)}</strong></div>
            <div className={styles.balanceActions}>
              <button className={styles.depositButton} type="button">Пополнить</button>
              <button className={styles.withdrawButton} type="button">Вывести</button>
            </div>
            <div><span>Доступно ставок</span><strong>{profile.bids}</strong></div>
            <div><span>На сайте с</span><strong>{new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long' }).format(new Date(profile.createdAt))}</strong></div>
          </article>
          <article className={styles.accountCard}>
            <h2>Данные аккаунта</h2>
            <dl>
              <div><dt>Имя</dt><dd>{profile.name}</dd></div>
              <div><dt>Логин</dt><dd>{profile.email}</dd></div>
              <div><dt>ID пользователя</dt><dd className={styles.userId}>{profile.id}</dd></div>
            </dl>
          </article>
        </section>
      )}

      {section === 'bids' && (
        <section className={styles.listSection}>
          <div className={styles.sectionHeading}><div><h2>История ставок</h2><p>Последние 100 действий</p></div></div>
          {bids.length === 0 ? <p className={styles.empty}>Ставок пока нет. Они появятся здесь после участия в торгах.</p> : (
            <div className={styles.historyList}>
              {bids.map((bid) => (
                <Link href={`/lot/${bid.lot.id}`} className={styles.historyItem} key={bid.id}>
                  <div className={styles.lotThumb}>
                    {bid.lot.image ? <Image src={backendAssetUrl(bid.lot.image)} alt="" fill sizes="64px" /> : <span>Лот</span>}
                  </div>
                  <div className={styles.lotInfo}><strong>{bid.lot.title}</strong><span>{formatDate(bid.createdAt)}</span></div>
                  <div className={styles.bidCount}>{formatBidCount(bid.bidCount)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {section === 'wins' && (
        <section className={styles.listSection}>
          <div className={styles.sectionHeading}><div><h2>Мои выигрыши</h2><p>Лоты, в которых вы победили</p></div></div>
          {wins.length === 0 ? <p className={styles.empty}>Выигрышей пока нет.</p> : (
            <div className={styles.historyList}>
              {wins.map((win) => (
                <Link href={`/lot/${win.lot.id}`} className={styles.historyItem} key={win.id}>
                  <div className={styles.lotThumb}>
                    {win.lot.image ? <Image src={backendAssetUrl(win.lot.image)} alt="" fill sizes="64px" /> : <span>Лот</span>}
                  </div>
                  <div className={styles.lotInfo}><strong>{win.lot.title}</strong><span>Выигрыш · {formatDate(win.wonAt)}</span></div>
                  <div className={styles.bidCount}>{formatMoney(win.lot.basePrice)}</div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  )
}
