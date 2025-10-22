'use client'

import { useState, useEffect } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LogFileList } from '@/components/log-file-list'
import { RequestEditor } from '@/components/request-editor'
import { FileText } from 'lucide-react'
import { LogFile } from '@/types/log'
import { fetchApi } from '@/lib/api'

export default function Home() {
  const [logFiles, setLogFiles] = useState<LogFile[]>([])
  const [selectedFile, setSelectedFile] = useState<LogFile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadLogFiles()
  }, [])

  const loadLogFiles = async () => {
    try {
      setLoading(true)
      const response = await fetchApi('/api/logs')
      const data = await response.json()

      if (response.ok) {
        setLogFiles(data.files || [])
        setError(null)
      } else {
        setError(data.message || 'Failed to load log files')
      }
    } catch {
      setError('Failed to connect to server')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = (file: LogFile) => {
    setSelectedFile(file)
  }

  return (
    <div className="h-screen bg-background flex">
      {/* Sidebar */}
      <div className="flex-shrink-0 w-80 border-r border-border bg-background flex flex-col">
        <div className="flex-shrink-0 border-b border-border p-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            로그 파일
          </h2>
          <p className="text-sm text-muted-foreground">
            {loading ? '로딩 중...' : `${logFiles.length}개 파일`}
          </p>
        </div>
        <div className="flex-1 min-h-0">
          <ScrollArea className="h-full">
            <LogFileList
              files={logFiles}
              selectedFile={selectedFile}
              onFileSelect={handleFileSelect}
              loading={loading}
              error={error}
              onRefresh={loadLogFiles}
            />
          </ScrollArea>
        </div>
      </div>

      {/* Main Content Area - Just RequestEditor */}
      <div className="flex-1 min-w-0">
        <RequestEditor
          selectedFile={selectedFile}
          onFileUpdate={loadLogFiles}
        />
      </div>
    </div>
  )
}
