'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LogFile, LogData } from '@/types/log'
import { fetchApi } from '@/lib/api'
import { formatTimestamp } from '@/lib/utils'
import { FileText, Download, Eye, AlertCircle } from 'lucide-react'
import { JsonViewer } from './json-viewer'

interface LogViewerProps {
  selectedFile: LogFile | null
  isActiveTab?: boolean
  expandedMessages?: Set<string>
  expandedOutputs?: Set<string>
  savedScrollPositions?: { [key: string]: number }
  onMessageToggle?: (messageId: string) => void
  onOutputToggle?: (outputId: string) => void
  onScrollPositionSave?: (positions: { [key: string]: number } | ((prev: { [key: string]: number }) => { [key: string]: number })) => void
}

export function LogViewer({
  selectedFile,
  isActiveTab = true,
  expandedMessages = new Set(),
  expandedOutputs = new Set(),
  savedScrollPositions = {},
  onMessageToggle = () => {},
  onOutputToggle = () => {},
  onScrollPositionSave = () => {}
}: LogViewerProps) {
  const [logData, setLogData] = useState<LogData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Scroll position management
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const currentFileRef = useRef<string | null>(null)

  // Save scroll position when switching files or tabs
  const saveScrollPosition = useCallback(() => {
    if (currentFileRef.current && scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
      if (scrollElement) {
        onScrollPositionSave(prev => ({
          ...prev,
          [currentFileRef.current!]: scrollElement.scrollTop
        }))
      }
    }
  }, [onScrollPositionSave])

  // Save scroll position when file changes
  useEffect(() => {
    // Save scroll position of previous file
    saveScrollPosition()

    if (selectedFile) {
      currentFileRef.current = selectedFile.name
      loadLogFile(selectedFile.name)
    } else {
      currentFileRef.current = null
      setLogData(null)
    }
  }, [selectedFile, saveScrollPosition])

  // Restore scroll position after data loads
  useEffect(() => {
    if (logData && selectedFile && scrollAreaRef.current) {
      const savedPosition = savedScrollPositions[selectedFile.name]
      if (savedPosition !== undefined && savedPosition > 0) {
        const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
          // Use requestAnimationFrame to ensure DOM is fully rendered
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollElement.scrollTop = savedPosition
            })
          })
        }
      }
    }
  }, [logData, selectedFile, savedScrollPositions])

  // Save scroll position when tab becomes inactive
  useEffect(() => {
    if (!isActiveTab) {
      saveScrollPosition()
    }
  }, [isActiveTab, saveScrollPosition])

  // Restore scroll position when tab becomes active and data is loaded
  useEffect(() => {
    if (isActiveTab && logData && selectedFile && scrollAreaRef.current) {
      const savedPosition = savedScrollPositions[selectedFile.name]
      if (savedPosition !== undefined && savedPosition > 0) {
        const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]')
        if (scrollElement) {
          // Use requestAnimationFrame to ensure DOM is fully rendered
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              scrollElement.scrollTop = savedPosition
            })
          })
        }
      }
    }
  }, [isActiveTab, logData, selectedFile, savedScrollPositions])

  const loadLogFile = async (fileName: string) => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetchApi(`/api/logs/${encodeURIComponent(fileName)}`)
      if (!response.ok) {
        throw new Error('Failed to load log file')
      }

      const data = await response.json()
      setLogData(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const downloadFile = () => {
    if (!selectedFile || !logData) return

    const blob = new Blob([JSON.stringify(logData, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = selectedFile.name
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (!selectedFile) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">로그 파일을 선택하세요</p>
            <p className="text-sm">좌측 목록에서 파일을 클릭하여 내용을 확인할 수 있습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }


  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            {selectedFile?.name}
          </span>
          <Button onClick={downloadFile} variant="outline" size="sm" disabled={!logData}>
            <Download className="h-4 w-4 mr-2" />
            다운로드
          </Button>
        </CardTitle>
        <CardDescription>
          {selectedFile?.parsedInfo && (
            <>
              {selectedFile.parsedInfo.component} • {selectedFile.parsedInfo.type} •
              {formatTimestamp(selectedFile.parsedInfo.datetime)}
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {loading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">로딩 중...</div>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center h-32 text-destructive">
            <AlertCircle className="h-5 w-5 mr-2" />
            {error}
          </div>
        )}

        {logData && (
          <Tabs defaultValue="formatted" className="w-full h-full flex flex-col">
            <TabsList className="flex-shrink-0">
              <TabsTrigger value="formatted">포맷된 뷰</TabsTrigger>
              <TabsTrigger value="raw">원본 JSON</TabsTrigger>
            </TabsList>

            <TabsContent value="formatted" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-full" ref={scrollAreaRef}>
                <JsonViewer
                  data={logData}
                  expandedMessages={expandedMessages}
                  expandedOutputs={expandedOutputs}
                  onMessageToggle={onMessageToggle}
                  onOutputToggle={onOutputToggle}
                />
              </ScrollArea>
            </TabsContent>

            <TabsContent value="raw" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-full">
                <pre className="text-sm bg-muted p-4 rounded-lg overflow-auto">
                  <code>{JSON.stringify(logData, null, 2)}</code>
                </pre>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}