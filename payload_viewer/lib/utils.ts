import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatTimestamp(timestamp: string): string {
  return new Date(timestamp).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Asia/Seoul'
  })
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

export function parseLogFileName(fileName: string) {
  const match = fileName.match(/^(\d{4}-\d{2}-\d{2})_(\d{9})_(.+)_(REQ|RES)\.json$/)

  if (match) {
    const [, date, timestamp, component, type] = match
    // 타임스탬프 파싱 개선: HHMMSSXXX 형식을 올바르게 파싱
    const hour = timestamp.substring(0, 2)
    const minute = timestamp.substring(2, 4)
    const second = timestamp.substring(4, 6)
    const millisecond = timestamp.substring(6, 9)

    return {
      date,
      timestamp,
      component,
      type: type as 'REQ' | 'RES',
      datetime: new Date(`${date}T${hour}:${minute}:${second}.${millisecond}Z`)
    }
  }

  return null
}