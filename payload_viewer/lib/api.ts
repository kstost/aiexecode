// API configuration utilities

export const getApiBaseUrl = () => {
  // Always use relative URLs to the same server
  if (typeof window !== 'undefined') {
    return window.location.origin
  }
  // Fallback for SSR
  return 'http://localhost:3300'
}

export const apiUrl = (path: string) => {
  return `${getApiBaseUrl()}${path}`
}

export const fetchApi = async (path: string, options?: RequestInit) => {
  const url = apiUrl(path)
  return fetch(url, options)
}