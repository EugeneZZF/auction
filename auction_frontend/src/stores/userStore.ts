import { makeAutoObservable } from 'mobx'

export interface User {
  id: string
  email: string
  name?: string
  balance: number
  bids: number
}

interface AuthResponse {
  user: User
  accessToken: string
  refreshToken: string
}

class UserStore {
  user: User | null = null
  accessToken: string | null = null
  refreshToken: string | null = null
  // Добавляем состояние автоставок для отслеживания
  autoBids: { [lotId: string]: { enabled: boolean; maxBids: number } } = {}
  // Callback'и для уведомления об отключении автоставок
  private autoBidDisableCallbacks: { [lotId: string]: (() => void)[] } = {}

  constructor() {
    makeAutoObservable(this)
  }

  setUser(authResponse: AuthResponse) {
    if (
      typeof authResponse.user === 'object' &&
      'accessToken' in authResponse.user
    ) {
      console.warn('[MobX] ❌ Токены не должны быть внутри user объекта!')
    }

    this.user = {
      id: authResponse.user.id,
      email: authResponse.user.email,
      name: authResponse.user.name,
      balance: authResponse.user.balance,
      bids: authResponse.user.bids,
    }

    this.accessToken = authResponse.accessToken
    this.refreshToken = authResponse.refreshToken

    this.saveToStorage()
  }

  clearUser() {
    this.user = null
    this.accessToken = null
    this.refreshToken = null
    this.autoBids = {}

    if (typeof window !== 'undefined') {
      localStorage.removeItem('auth')
    }
  }

  /**
   * Метод для выхода пользователя с перенаправлением на главную
   * Очищает все данные и перенаправляет на главную страницу
   */
  logout() {
    console.log('🚪 UserStore: Выход пользователя')
    this.clearUser()
    
    if (typeof window !== 'undefined') {
      // Используем replace чтобы пользователь не мог вернуться назад
      window.location.replace('/')
    }
  }

  get isAuthenticated() {
    return !!this.user && !!this.accessToken
  }

  get userName() {
    return this.user?.name ?? 'Гость'
  }

  get userBalance() {
    return this.user?.balance ?? 0
  }

  get userBids() {
    return this.user?.bids ?? 0
  }

  updateBalance(balance: number) {
    if (this.user) {
      this.user.balance = balance
      this.saveToStorage()
    }
  }

  updateBids(bids: number) {
    if (this.user) {
      this.user.bids = bids
      this.saveToStorage()
    }
  }

  // Метод для обновления баланса и ставок одновременно
  updateUserData(balance: number, bids: number) {
    if (this.user) {
      this.user.balance = balance
      this.user.bids = bids
      this.saveToStorage()
      console.log('🔄 userStore: Обновлены данные пользователя', { balance, bids })
      
      // Проверяем, если ставки закончились, отключаем все автоставки
      if (bids <= 0) {
        console.log('⚠️ userStore: Ставки закончились, отключаем все автоставки')
        this.disableAllAutoBids()
      }
    }
  }

  // Метод для обновления данных по WebSocket событию
  handleUserBalanceUpdate(data: { userId: string; balance: number; bids: number; timestamp: number }) {
    if (this.user && data.userId === this.user.id) {
      this.updateUserData(data.balance, data.bids)
      console.log('💰 userStore: Баланс обновлен через WebSocket', data)
      
      // Проверяем, если ставки закончились, отключаем все автоставки
      if (data.bids <= 0) {
        console.log('⚠️ userStore: Ставки закончились, отключаем все автоставки')
        this.disableAllAutoBids()
      }
    }
  }

  // Методы для управления автоставками
  setAutoBid(lotId: string, enabled: boolean, maxBids?: number) {
    if (enabled && maxBids) {
      this.autoBids[lotId] = { enabled: true, maxBids }
    } else {
      delete this.autoBids[lotId]
    }
    this.saveToStorage()
  }

  getAutoBid(lotId: string) {
    return this.autoBids[lotId] || null
  }

  // Метод для отключения всех автоставок при окончании лота
  disableAllAutoBids() {
    this.autoBids = {}
    this.saveToStorage()
  }

  // Метод для отключения автоставки конкретного лота
  disableAutoBid(lotId: string) {
    if (this.autoBids[lotId]) {
      delete this.autoBids[lotId]
      this.saveToStorage()
      
      // Уведомляем все подписчики об отключении автоставки
      this.notifyAutoBidDisabled(lotId)
    }
  }

  // Метод для подписки на уведомления об отключении автоставки
  onAutoBidDisabled(lotId: string, callback: () => void) {
    if (!this.autoBidDisableCallbacks[lotId]) {
      this.autoBidDisableCallbacks[lotId] = []
    }
    this.autoBidDisableCallbacks[lotId].push(callback)
  }

  // Метод для отписки от уведомлений об отключении автоставки
  offAutoBidDisabled(lotId: string, callback: () => void) {
    if (this.autoBidDisableCallbacks[lotId]) {
      const index = this.autoBidDisableCallbacks[lotId].indexOf(callback)
      if (index > -1) {
        this.autoBidDisableCallbacks[lotId].splice(index, 1)
      }
    }
  }

  // Приватный метод для уведомления всех подписчиков
  private notifyAutoBidDisabled(lotId: string) {
    if (this.autoBidDisableCallbacks[lotId]) {
      this.autoBidDisableCallbacks[lotId].forEach(callback => {
        try {
          callback()
        } catch (error) {
          console.error('Ошибка в callback автоставки:', error)
        }
      })
    }
  }

  saveToStorage() {
    if (typeof window === 'undefined') return

    if (this.user && this.accessToken && this.refreshToken) {
      localStorage.setItem(
        'auth',
        JSON.stringify({
          user: this.user,
          accessToken: this.accessToken,
          refreshToken: this.refreshToken,
          autoBids: this.autoBids, // Сохраняем автоставки
        })
      )
    }
  }

  loadFromStorage() {
    if (typeof window === 'undefined') return

    const stored = localStorage.getItem('auth')
    if (stored) {
      try {
        const data = JSON.parse(stored)
        if (data.user && data.accessToken && data.refreshToken) {
          this.setUser(data)
          // Восстанавливаем автоставки
          if (data.autoBids) {
            this.autoBids = data.autoBids
          }
        }
      } catch (error) {
        console.warn('Не удалось восстановить пользователя из localStorage', error)
      }
    }
  }
}

export const userStore = new UserStore()
