import axios from 'axios'
import { ensureValidToken, handleUnauthorized } from '@/handlers/jwt_handler'
import { userStore } from '@/stores/userStore'
import { API_URL } from '@/config/api'

// создаём инстанс с базовым URL
const api = axios.create({
  baseURL: API_URL,
})

// Interceptor для автоматического добавления токена к запросам
api.interceptors.request.use(async (config) => {
  // Проверяем и обновляем токен при необходимости
  await ensureValidToken()
  
  if (userStore.accessToken) {
    config.headers.Authorization = `Bearer ${userStore.accessToken}`
  }
  
  return config
})

// Interceptor для обработки 401 ошибок
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      
      console.log('🔐 API: Получен 401, пытаемся обновить токен...')
      
      // Пытаемся обновить токен
      const tokenRefreshed = await handleUnauthorized(error.response)
      
      if (tokenRefreshed) {
        console.log('✅ API: Токен обновлен, повторяем запрос')
        // Повторяем оригинальный запрос с новым токеном
        originalRequest.headers.Authorization = `Bearer ${userStore.accessToken}`
        return api(originalRequest)
      } else {
        console.log('❌ API: Не удалось обновить токен, пользователь будет разлогинен')
      }
    }
    
    return Promise.reject(error instanceof Error ? error : new Error('Network error'))
  }
)

// тип для одного лота (можешь заменить на свой)
export interface Lot {
  id: string
  title: string
  description?: string
  image?: string
  basePrice: number
  periodSeconds: number
  currentStart: string
  currentEnd: string
  inactivityEndsAt: string
  inactivityTimeoutMs: number
  isActive: boolean
  isFinished: boolean
  botsEnabled: boolean
  createdAt: string
}

// интерфейс для ответа покупки ставок
export interface BuyBidResponse {
  id: string
  email: string
  name: string
  role: string
  balance: number
  bids: number
  createdAt: string
  updatedAt: string
}

export interface GetWins {
  id: string
  lotId: string
  wonAt: string
  lot: Lot
}

export interface UserProfile {
  id: string
  name: string
  email: string
  balance: number
  bids: number
  createdAt: string
}

export interface BidHistoryItem {
  id: string
  bidCount: number
  createdAt: string
  lot: {
    id: string
    title: string
    image: string | null
    basePrice: number
  }
}

export interface AdminBot {
  id: string
  name: string
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: string
  balance: number
  createdAt: string
}

export interface LotInput {
  description?: string
  basePrice: number
  periodSeconds: number
  inactivityTimeoutMs?: number
  isActive?: boolean
}


export const getLots = async (): Promise<Lot[]> => {
  const response = await api.get<Lot[]>('/lots')
  return response.data
}

export const getActiveLots = async (): Promise<Lot[]> => {
  const response = await api.get<Lot[]>('/lots/active')
  return response.data
}

export const getLotById = async (id: string): Promise<Lot> => {
  const response = await api.get<Lot>(`/lots/${id}`)
  return response.data
}

export const buyBid = async (quantity: number): Promise<BuyBidResponse> => {
  if (!userStore.isAuthenticated) {
    throw new Error('Необходима авторизация')
  }

  const response = await api.post<BuyBidResponse>('/bids/buy', { quantity })
  return response.data
}

export const getWins = async (): Promise<GetWins[]> => {
  if (!userStore.isAuthenticated) {
    throw new Error('Необходима авторизация')
  }

  const response = await api.get<GetWins[]>('/auth/user/wins')
  console.log(response.data)
  return response.data
}

export const getUserProfile = async (): Promise<UserProfile> => {
  const response = await api.get<UserProfile>('/auth/user/profile')
  return response.data
}

export const getUserBidHistory = async (): Promise<BidHistoryItem[]> => {
  const response = await api.get<BidHistoryItem[]>('/auth/user/bids')
  return response.data
}

export const createLot = async (data: LotInput): Promise<Lot> => {
  const response = await api.post<Lot>('/lots', data)
  return response.data
}

export const updateLot = async (id: string, data: Partial<LotInput>): Promise<Lot> => {
  const response = await api.patch<Lot>(`/lots/${id}`, data)
  return response.data
}

export const deleteLot = async (id: string): Promise<void> => {
  await api.delete(`/lots/${id}`)
}

export const toggleLot = async (id: string): Promise<Lot> => {
  const response = await api.patch<Lot>(`/lots/${id}/toggle`)
  return response.data
}

export const setLotBotsEnabled = async (id: string, enabled: boolean): Promise<Lot> => {
  const response = await api.patch<Lot>(`/lots/${id}/bots`, { enabled })
  return response.data
}

export const getAdminBots = async (): Promise<AdminBot[]> => {
  const response = await api.get<AdminBot[]>('/bots')
  return response.data
}

export const createAdminBot = async (name: string): Promise<AdminBot> => {
  const response = await api.post<AdminBot>('/bots', { name })
  return response.data
}

export const deleteAdminBot = async (id: string): Promise<void> => {
  await api.delete(`/bots/${id}`)
}

export const searchAdminUsers = async (search = ''): Promise<AdminUser[]> => {
  const response = await api.get<AdminUser[]>('/auth/admin/users', {
    params: { search },
  })
  return response.data
}

export const addUserBalance = async (
  id: string,
  amountRubles: number,
): Promise<AdminUser> => {
  const response = await api.patch<AdminUser>(`/auth/admin/users/${id}/balance`, {
    amountRubles,
  })
  return response.data
}

export const updateAdminUser = async (
  id: string,
  changes: { email?: string; password?: string },
): Promise<AdminUser> => {
  const response = await api.patch<AdminUser>(`/auth/admin/users/${id}`, changes)
  return response.data
}
