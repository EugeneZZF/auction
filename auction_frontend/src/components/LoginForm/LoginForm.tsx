'use client'

import { FormEvent, useState } from 'react'
import { observer } from 'mobx-react-lite'
import { API_URL } from '@/config/api'
import AuthCodeForm from '@/components/AuthCodeForm/AuthCodeForm'
import styles from './LoginForm.module.css'

const LoginForm = observer(() => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challengeId, setChallengeId] = useState<string | null>(null)
  const [resendAvailableAt, setResendAvailableAt] = useState('')
  const [resendsRemaining, setResendsRemaining] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const result = await response.json()

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join(', ')
          : result.message
        throw new Error(message || 'Неверный email или пароль')
      }

      if (!result.twoFactorRequired || !result.challengeId) {
        throw new Error('Сервер не создал запрос на подтверждение входа')
      }

      setChallengeId(result.challengeId)
      setResendAvailableAt(result.resendAvailableAt)
      setResendsRemaining(result.resendsRemaining)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось войти')
    } finally {
      setLoading(false)
    }
  }

  if (challengeId) {
    return (
      <AuthCodeForm
        cancelLabel="Вернуться ко входу"
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
      <h1>Войти в аккаунт</h1>

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
        autoComplete="current-password"
        id="password"
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Пароль"
        required
        type="password"
        value={password}
      />

      {error && <p className={styles.error} role="alert">{error}</p>}

      <button type="submit" disabled={loading}>
        {loading ? 'Проверяем…' : 'Войти'}
      </button>
    </form>
  )
})

export default LoginForm
