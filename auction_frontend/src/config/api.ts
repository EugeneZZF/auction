const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4200'

export const API_BASE_URL = configuredApiUrl.replace(/\/+$/, '')
export const API_URL = `${API_BASE_URL}/api`

export function backendAssetUrl(path?: string | null): string {
  if (!path) return ''
  if (/^https?:\/\//i.test(path)) return path

  const normalizedPath = path.replace(/\\/g, '/')
  if (normalizedPath.startsWith('/uploads/')) {
    return `${API_BASE_URL}${normalizedPath}`
  }
  if (normalizedPath.startsWith('/api/upload/image/')) {
    return `${API_BASE_URL}${normalizedPath}`
  }
  if (/^\/(500|1000|2000|5000)\.svg$/.test(normalizedPath)) {
    return normalizedPath
  }

  const pathSegments = normalizedPath.split('/').filter(Boolean)
  const filename = pathSegments[pathSegments.length - 1]
  return filename
    ? `${API_URL}/upload/image/${encodeURIComponent(filename)}`
    : ''
}
