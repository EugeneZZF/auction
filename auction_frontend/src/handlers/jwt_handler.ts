import { userStore } from '@/stores/userStore'
import { API_URL } from '@/config/api'

interface RefreshTokenResponse {
  user: {
    id: string
    email: string
    name: string
    balance: number
    bids: number
  }
  accessToken: string
  refreshToken: string
}

interface ErrorResponse {
  message: string
  statusCode: number
}

/**
 * Обновляет токен доступа используя refresh token
 * При успехе - обновляет данные в UserStore и localStorage
 * При неудаче - очищает все данные и перенаправляет на главную
 */
export const refreshAccessToken = async (): Promise<boolean> => {
  try {
    const refreshToken = userStore.refreshToken
    
    if (!refreshToken) {
      console.log('🔄 JWT: Нет refresh token для обновления')
      await handleTokenRefreshFailure()
      return false
    }

    console.log('🔄 JWT: Попытка обновления токена...')

    const response = await fetch(`${API_URL}/auth/login/access-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userStore.accessToken}`,
      },
      body: JSON.stringify({ refreshToken }),
    })

    if (!response.ok) {
      const errorData: ErrorResponse = await response.json()
      console.log('❌ JWT: Ошибка обновления токена:', errorData)
      await handleTokenRefreshFailure()
      return false
    }

    const data: RefreshTokenResponse = await response.json()
    console.log('✅ JWT: Токен успешно обновлен')

    // Обновляем данные в UserStore и localStorage
    userStore.setUser({
      user: data.user,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    })

    return true

  } catch (error) {
    console.error('❌ JWT: Ошибка при обновлении токена:', error)
    await handleTokenRefreshFailure()
    return false
  }
}

/**
 * Обработка неудачного обновления токена
 * Очищает все данные пользователя и перенаправляет на главную
 */
const handleTokenRefreshFailure = async (): Promise<void> => {
  console.log('🚪 JWT: Выход пользователя из-за неудачного обновления токена')
  
  // Очищаем все данные пользователя
  userStore.clearUser()
  
  // Перенаправляем на главную страницу
  if (typeof window !== 'undefined') {
    // Используем replace чтобы пользователь не мог вернуться назад
    window.location.replace('/')
  }
}

/**
 * Проверяет не истек ли токен доступа
 * Если истек - пытается обновить его
 */
export const ensureValidToken = async (): Promise<boolean> => {
  if (!userStore.accessToken) {
    console.log('🔍 JWT: Нет токена доступа')
    return false
  }

  try {
    // Декодируем токен чтобы проверить время истечения
    const tokenPayload = JSON.parse(atob(userStore.accessToken.split('.')[1]))
    const currentTime = Math.floor(Date.now() / 1000)
    const tokenExp = tokenPayload.exp

    // Если токен истекает в ближайшие 5 минут, обновляем его
    const timeUntilExpiry = tokenExp - currentTime
    const fiveMinutes = 5 * 60

    if (timeUntilExpiry <= fiveMinutes) {
      console.log('⏰ JWT: Токен скоро истечет, обновляем...', { 
        timeUntilExpiry, 
        willExpireAt: new Date(tokenExp * 1000).toISOString() 
      })
      return await refreshAccessToken()
    }

    return true

  } catch (error) {
    console.error('❌ JWT: Ошибка при проверке токена:', error)
    return await refreshAccessToken()
  }
}

/**
 * Middleware для автоматической обработки 401 ошибок
 * Используется в API запросах
 */
export const handleUnauthorized = async (response: Response): Promise<boolean> => {
  if (response.status === 401) {
    console.log('🔐 JWT: Получен 401, пытаемся обновить токен...')
    return await refreshAccessToken()
  }
  return true
}

// DEBUG ФУНКЦИИ ДЛЯ ТЕСТИРОВАНИЯ

/**
 * Принудительно делает токен истекшим для тестирования
 * ТОЛЬКО ДЛЯ РАЗРАБОТКИ!
 */
export const expireTokenForTesting = (): void => {
  if (!userStore.accessToken) {
    console.log('🧪 DEBUG: Нет токена для истечения')
    return
  }

  try {
    // Декодируем токен
    const tokenPayload = JSON.parse(atob(userStore.accessToken.split('.')[1]))
    
    // Устанавливаем время истечения на прошлое время
    tokenPayload.exp = Math.floor(Date.now() / 1000) - 60 // истек минуту назад
    
    // Кодируем обратно (это не будет валидный токен, но для тестирования подойдет)
    const header = userStore.accessToken.split('.')[0]
    const signature = userStore.accessToken.split('.')[2]
    const expiredToken = `${header}.${btoa(JSON.stringify(tokenPayload))}.${signature}`
    
    // Обновляем токен в store
    userStore.accessToken = expiredToken
    userStore.saveToStorage()
    
    console.log('🧪 DEBUG: Токен принудительно истек', {
      originalExp: new Date(tokenPayload.exp * 1000).toISOString(),
      newExp: new Date((Math.floor(Date.now() / 1000) - 60) * 1000).toISOString()
    })
  } catch (error) {
    console.error('🧪 DEBUG: Ошибка при истечении токена:', error)
  }
}

/**
 * Показывает информацию о текущем токене
 */
export const debugTokenInfo = (): void => {
  if (!userStore.accessToken) {
    console.log('🧪 DEBUG: Токен отсутствует')
    return
  }

  try {
    const tokenPayload = JSON.parse(atob(userStore.accessToken.split('.')[1]))
    const currentTime = Math.floor(Date.now() / 1000)
    const timeUntilExpiry = tokenPayload.exp - currentTime
    
    console.log('🧪 DEBUG: Информация о токене:', {
      userId: tokenPayload.id,
      issuedAt: new Date(tokenPayload.iat * 1000).toISOString(),
      expiresAt: new Date(tokenPayload.exp * 1000).toISOString(),
      timeUntilExpiry: `${Math.floor(timeUntilExpiry / 60)} минут ${timeUntilExpiry % 60} секунд`,
      isExpired: timeUntilExpiry <= 0,
      willExpireSoon: timeUntilExpiry <= 300 // 5 минут
    })
  } catch (error) {
    console.error('🧪 DEBUG: Ошибка при анализе токена:', error)
  }
}

/**
 * Симулирует 401 ошибку для тестирования
 */
export const simulate401Error = async (): Promise<void> => {
  console.log('🧪 DEBUG: Симулируем 401 ошибку...')
  
  try {
    // Делаем запрос с заведомо неверным токеном
    const fakeToken = 'invalid.token.here'
    const originalToken = userStore.accessToken
    
    // Временно устанавливаем неверный токен
    userStore.accessToken = fakeToken
    
    // Пытаемся сделать запрос (это должно вызвать 401)
    await fetch(`${API_URL}/lots`, {
      headers: {
        'Authorization': `Bearer ${fakeToken}`
      }
    })
    
    // Восстанавливаем оригинальный токен
    userStore.accessToken = originalToken
    
  } catch (error) {
    console.log('🧪 DEBUG: Получена ожидаемая ошибка:', error)
  }
}

// Добавляем debug функции в window для удобного тестирования в консоли браузера
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).debugToken = {
    info: debugTokenInfo,
    expire: expireTokenForTesting,
    simulate401: simulate401Error,
    refresh: refreshAccessToken
  }
  
  console.log('🧪 DEBUG: Доступны функции для тестирования токенов:')
  console.log('- window.debugToken.info() - информация о токене')
  console.log('- window.debugToken.expire() - принудительно истечь токен')
  console.log('- window.debugToken.simulate401() - симулировать 401 ошибку')
  console.log('- window.debugToken.refresh() - принудительно обновить токен')
}
