'use client'

import { FormEvent, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { userStore } from '@/stores/userStore'
import { API_URL } from '@/config/api'
import styles from './AuthCodeForm.module.css'

interface AuthCodeFormProps {
  challengeId: string
  email: string
  cancelLabel: string
  resendAvailableAt: string
  initialResendsRemaining: number
  onCancel: () => void
}

export default function AuthCodeForm({
  challengeId,
  email,
  cancelLabel,
  resendAvailableAt: initialResendAvailableAt,
  initialResendsRemaining,
  onCancel,
}: AuthCodeFormProps) {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)
  const [resendAvailableAt, setResendAvailableAt] = useState(initialResendAvailableAt)
  const [resendsRemaining, setResendsRemaining] = useState(initialResendsRemaining)
  const [now, setNow] = useState(Date.now())
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [])

  const resendSeconds = Math.max(
    0,
    Math.ceil((new Date(resendAvailableAt).getTime() - now) / 1000),
  )

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setLoading(true)

    try {
      const response = await fetch(`${API_URL}/auth/login/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code }),
      })
      const result = await response.json()

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join(', ')
          : result.message
        throw new Error(message || 'Не удалось подтвердить код')
      }

      userStore.setUser(result)
      router.push('/')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Не удалось подтвердить код')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    setNotice('')
    setResending(true)

    try {
      const response = await fetch(`${API_URL}/auth/login/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      })
      const result = await response.json()

      if (!response.ok) {
        const message = Array.isArray(result.message)
          ? result.message.join(', ')
          : result.message
        throw new Error(message || 'Не удалось отправить код повторно')
      }

      setResendAvailableAt(result.resendAvailableAt)
      setResendsRemaining(result.resendsRemaining)
      setCode('')
      setNotice('Новый код отправлен на почту')
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : 'Не удалось отправить код повторно')
    } finally {
      setResending(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1>Проверьте почту</h1>
      <p className={styles.description}>
        Мы отправили восьмизначный код на <strong>{email}</strong>. Он действует 5 минут.
      </p>

      <label htmlFor="email-code">Код из письма</label>
      <input
        autoComplete="one-time-code"
        autoFocus
        id="email-code"
        inputMode="numeric"
        maxLength={8}
        onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 8))}
        pattern="[0-9]{8}"
        placeholder="00000000"
        required
        value={code}
      />

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      <button disabled={loading || code.length !== 8} type="submit">
        {loading ? 'Проверяем…' : 'Подтвердить и войти'}
      </button>
      <button className={styles.back} onClick={onCancel} type="button">
        {cancelLabel}
      </button>
      <button
        className={styles.resend}
        disabled={resending || loading || resendSeconds > 0 || resendsRemaining <= 0}
        onClick={handleResend}
        type="button"
      >
        {resending
          ? 'Отправляем…'
          : resendsRemaining <= 0
            ? 'Лимит повторной отправки исчерпан'
            : resendSeconds > 0
              ? `Отправить код повторно через ${resendSeconds} сек.`
              : 'Отправить код повторно'}
      </button>
    </form>
  )
}
