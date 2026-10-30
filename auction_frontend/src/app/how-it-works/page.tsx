import Link from 'next/link'
import styles from './page.module.css'

const steps = [
  { number: '01', title: 'Создайте аккаунт', text: 'Зарегистрируйтесь по email и подтвердите вход одноразовым кодом из письма.' },
  { number: '02', title: 'Выберите лот', text: 'Откройте каталог, посмотрите описание и текущие ставки, затем перейдите на страницу лота.' },
  { number: '03', title: 'Сделайте ставку', text: 'Для каждой ставки нужен один доступный билет. Баланс и оставшиеся билеты видны в шапке сайта и профиле.' },
  { number: '04', title: 'Следите за торгами', text: 'Новые ставки обновляют ход аукциона. Если после последней ставки лот неактивен заданное время, раунд завершается.' },
  { number: '05', title: 'Проверьте результат', text: 'Победитель последнего действия определяется после завершения раунда. История ставок и выигрыши доступны в личном кабинете.' },
]

export default function HowItWorksPage() {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <span className={styles.kicker}>GoldenDay · правила участия</span>
        <h1>Как это работает</h1>
        <p>Пять шагов от регистрации до результата аукциона.</p>
        <Link className={styles.primary} href="/lot">Перейти к лотам</Link>
      </section>

      <section className={styles.steps} aria-label="Этапы участия в аукционе">
        {steps.map((step) => (
          <article className={styles.step} key={step.number}>
            <span className={styles.number}>{step.number}</span>
            <div><h2>{step.title}</h2><p>{step.text}</p></div>
          </article>
        ))}
      </section>

      <aside className={styles.note}>
        <strong>Обратите внимание</strong>
        <p>Перед ставкой проверьте описание лота и количество доступных билетов. Актуальное время до завершения раунда отображается на странице лота.</p>
      </aside>
      <p className={styles.help}>Остались вопросы? <Link href="/feedback">Напишите нам</Link>.</p>
    </main>
  )
}
