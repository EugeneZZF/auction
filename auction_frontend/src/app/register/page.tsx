'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import AuthCodeForm from '@/components/AuthCodeForm/AuthCodeForm'
import styles from './page.module.css'
import { API_URL } from '@/config/api'

function RegistrationForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [acceptedTerms, setAcceptedTerms] = useState(false)
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [resendAvailableAt, setResendAvailableAt] = useState('')
  const [resendsRemaining, setResendsRemaining] = useState(0)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')

    if (password !== confirmPassword) {
      setError('Пароли не совпадают')
      return
    }

    if (password.length < 6) {
      setError('Пароль должен содержать не менее 6 символов')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const result = await response.json()
      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join(', ')
          : result.message
        throw new Error(message || 'Не удалось создать аккаунт')
      }

      if (!result.twoFactorRequired || !result.challengeId) {
        throw new Error('Сервер не создал запрос на подтверждение регистрации')
      }

      setChallengeId(result.challengeId)
      setResendAvailableAt(result.resendAvailableAt)
      setResendsRemaining(result.resendsRemaining)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось создать аккаунт')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (challengeId) {
    return (
      <AuthCodeForm
        cancelLabel="Вернуться к регистрации"
        challengeId={challengeId}
        email={email}
        initialResendsRemaining={resendsRemaining}
        onCancel={() => setChallengeId(null)}
        resendAvailableAt={resendAvailableAt}
      />
    )
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Регистрация</h1>
      <Link className={styles.loginLink} href="/login">Войти в аккаунт?</Link>

      <div className={styles.fields}>
        <label htmlFor="name">Имя</label>
        <input
          autoComplete="name"
          id="name"
          maxLength={100}
          onChange={(event) => setName(event.target.value)}
          placeholder="Иван"
          required
          value={name}
        />

        <label htmlFor="email">Email</label>
        <input
          autoComplete="email"
          id="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="ivan@mail.ru"
          required
          type="email"
          value={email}
        />

        <label htmlFor="password">Пароль</label>
        <input
          autoComplete="new-password"
          id="password"
          minLength={6}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Пароль"
          required
          type="password"
          value={password}
        />

        <label htmlFor="confirm-password">Повтор пароля</label>
        <input
          autoComplete="new-password"
          id="confirm-password"
          onChange={(event) => setConfirmPassword(event.target.value)}
          placeholder="Повтор пароля"
          required
          type="password"
          value={confirmPassword}
        />
      </div>

      <label className={styles.consent}>
        <input
          checked={acceptedTerms}
          onChange={(event) => setAcceptedTerms(event.target.checked)}
          required
          type="checkbox"
        />
        <span>
          Отправляя заявку, вы принимаете условия договора-оферты, даёте согласие на обработку
          своих персональных данных в соответствии с политикой конфиденциальности и подтверждаете
          своё ознакомление с условиями Акции
        </span>
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}
      <button className={styles.submit} disabled={isSubmitting} type="submit">
        {isSubmitting ? 'Создаём аккаунт…' : 'Зарегистрироваться'}
      </button>
    </form>
  )
}

export default function RegisterPage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <RegistrationForm />
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerNav}>
            <Link className={styles.logo} href="/">GoldenDay</Link>
            <span className={styles.footerHeading}>Навигация</span>
            <Link href="/#how-it-works">Как это работает</Link>
            <Link href="/#feedback">Обратная связь</Link>
          </div>
          <div className={styles.legal}>
            <Link href="/#privacy">Политика обработки персональных данных</Link>
            <span>Юр. данные ИП / ООО, ИНН, ОГРН</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
