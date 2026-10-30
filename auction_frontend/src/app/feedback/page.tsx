'use client'

import { type FormEvent, useState } from 'react'
import Link from 'next/link'
import { API_URL } from '@/config/api'
import styles from './page.module.css'

export default function FeedbackPage() {
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formElement = event.currentTarget
    setLoading(true)
    setSuccess('')
    setError('')

    const form = new FormData(formElement)
    const payload = {
      name: String(form.get('name') || '').trim(),
      email: String(form.get('email') || '').trim(),
      subject: String(form.get('subject') || '').trim(),
      message: String(form.get('message') || '').trim(),
    }

    try {
      const response = await fetch(`${API_URL}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        const message = Array.isArray(result.message) ? result.message.join(' ') : result.message
        throw new Error(message || 'Не удалось отправить сообщение. Попробуйте ещё раз.')
      }
      setSuccess(result.message || 'Сообщение отправлено. Спасибо за обратную связь!')
      formElement.reset()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить сообщение. Попробуйте ещё раз.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className={styles.page}>
      <section className={styles.intro}>
        <span className={styles.kicker}>Мы на связи</span>
        <h1>Обратная связь</h1>
        <p>Задайте вопрос о торгах, сообщите о проблеме или поделитесь предложением.</p>
        <Link href="/how-it-works">Как работает GoldenDay →</Link>
      </section>

      <section className={styles.formCard}>
        <h2>Напишите нам</h2>
        <p className={styles.formHint}>Ответ отправим на указанную вами почту.</p>
        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.row}>
            <label>Ваше имя<input name="name" autoComplete="name" minLength={2} maxLength={80} required placeholder="Как к вам обращаться" /></label>
            <label>Email для ответа<input name="email" type="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" /></label>
          </div>
          <label>Тема обращения<input name="subject" minLength={3} maxLength={120} required placeholder="Например, вопрос по ставке" /></label>
          <label>Сообщение<textarea name="message" minLength={10} maxLength={4000} rows={7} required placeholder="Опишите, чем мы можем помочь" /></label>
          {success && <p className={styles.success} role="status">{success}</p>}
          {error && <p className={styles.error} role="alert">{error}</p>}
          <button type="submit" disabled={loading}>{loading ? 'Отправляем…' : 'Отправить сообщение'}</button>
          <small>Отправляя форму, вы соглашаетесь использовать указанный email для ответа на обращение.</small>
        </form>
      </section>
    </main>
  )
}
