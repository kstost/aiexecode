'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { LogFile } from '@/types/log'
import { formatFileSize } from '@/lib/utils'
import { RefreshCw, AlertCircle, FileText, Send, Download, Settings, CheckCircle, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LogFileListProps {
  files: LogFile[]
  selectedFile: LogFile | null
  onFileSelect: (file: LogFile) => void
  loading: boolean
  error: string | null
  onRefresh: () => void
}

export function LogFileList({
  files,
  selectedFile,
  onFileSelect,
  loading,
  error,
  onRefresh
}: LogFileListProps) {
  if (loading) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
        로딩 중...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-6 w-6 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive mb-2">{error}</p>
        <Button onClick={onRefresh} size="sm">
          다시 시도
        </Button>
      </div>
    )
  }

  // 컴포넌트 아이콘 매핑
  const getComponentIcon = (component: string) => {
    switch (component?.toLowerCase()) {
      case 'orchestrator': return <Settings className="h-4 w-4" />
      case 'verifier': return <CheckCircle className="h-4 w-4" />
      default: return <Zap className="h-4 w-4" />
    }
  }


  // 요청-응답 쌍으로 그룹화
  const createRequestResponsePairs = () => {
    const pairs: Array<{
      id: string
      component: string
      timestamp: string
      request?: LogFile
      response?: LogFile
    }> = []

    const reqFiles = files.filter(f => f.parsedInfo?.type === 'REQ')
    const resFiles = files.filter(f => f.parsedInfo?.type === 'RES')

    reqFiles.forEach(reqFile => {
      if (!reqFile.parsedInfo) return

      // REQ 파일명에서 타임스탬프 부분 추출 (예: 2025-09-23_072354803)
      const reqMatch = reqFile.name.match(/(\d{4}-\d{2}-\d{2}_\d{9})/)
      if (!reqMatch) return

      const reqTimestamp = reqMatch[1]

      // 같은 컴포넌트의 RES 파일 중에서 가장 가까운 시간의 파일 찾기
      let matchedRes: LogFile | undefined
      let minTimeDiff = Infinity

      resFiles
        .filter(f => f.parsedInfo?.component === reqFile.parsedInfo?.component)
        .forEach(resFile => {
          const resMatch = resFile.name.match(/(\d{4}-\d{2}-\d{2}_\d{9})/)
          if (!resMatch) return
          const reqTime = new Date(reqFile.parsedInfo!.datetime).getTime()
          const resTime = new Date(resFile.parsedInfo!.datetime).getTime()
          const timeDiff = Math.abs(resTime - reqTime)

          // 응답이 요청보다 나중에 오고, 시간 차이가 가장 적은 것
          if (resTime >= reqTime && timeDiff < minTimeDiff) {
            minTimeDiff = timeDiff
            matchedRes = resFile
          }
        })

      pairs.push({
        id: `${reqFile.parsedInfo.component}-${reqTimestamp}`,
        component: reqFile.parsedInfo.component,
        timestamp: reqFile.parsedInfo.datetime,
        request: reqFile,
        response: matchedRes
      })
    })

    // 매칭되지 않은 RES 파일들도 추가
    resFiles.forEach(resFile => {
      if (!resFile.parsedInfo) return

      const isMatched = pairs.some(pair => pair.response?.name === resFile.name)
      if (!isMatched) {
        const resMatch = resFile.name.match(/(\d{4}-\d{2}-\d{2}_\d{9})/)
        const resTimestamp = resMatch ? resMatch[1] : Date.now().toString()

        pairs.push({
          id: `${resFile.parsedInfo.component}-${resTimestamp}-res-only`,
          component: resFile.parsedInfo.component,
          timestamp: resFile.parsedInfo.datetime,
          response: resFile
        })
      }
    })

    // 시간순 정렬 (오래된 순)
    return pairs.sort((a, b) => {
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    })
  }

  const requestResponsePairs = createRequestResponsePairs()

  // 회차 번호 계산 (전체 통합)
  const pairsWithRound = requestResponsePairs.map((pair, index) => {
    return {
      ...pair,
      round: index + 1
    }
  })

  return (
    <div className="p-4 space-y-4">
      {/* Refresh Button */}
      <Button onClick={onRefresh} variant="outline" size="sm" className="w-full">
        <RefreshCw className="h-4 w-4 mr-2" />
        새로고침
      </Button>

      {/* Request-Response Pairs */}
      <div className="space-y-3">
        {pairsWithRound.map((pair) => {
          const isRequestSelected = selectedFile?.name === pair.request?.name
          const isResponseSelected = selectedFile?.name === pair.response?.name

          return (
            <div key={pair.id} className="border rounded-lg overflow-hidden">
              {/* 페어 헤더 */}
              <div className="bg-muted/30 px-4 py-2 border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getComponentIcon(pair.component)}
                    <span className="text-sm font-medium">
                      {pair.component === 'orchestrator' ? '오케스트레이터' :
                       pair.component === 'verifier' ? '검증기' : pair.component}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Badge variant="outline" className="text-xs">
                      #{pair.round}회차
                    </Badge>
                  </div>
                </div>
              </div>

              {/* 요청-응답 쌍 */}
              <div className="p-3 space-y-2">
                {/* 요청 파일 */}
                {pair.request && (
                  <div
                    className={cn(
                      "p-3 rounded-md border cursor-pointer transition-all duration-200 flex items-center justify-between",
                      isRequestSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "hover:bg-muted/50 border-border hover:border-border/80"
                    )}
                    onClick={() => onFileSelect(pair.request!)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 text-xs font-medium flex items-center gap-1">
                        <Send className="h-3 w-3" />
                        요청
                      </Badge>
                    </div>
                    <div className="text-xs opacity-60">
                      {formatFileSize(pair.request.size)}
                    </div>
                  </div>
                )}

                {/* 응답 파일 */}
                {pair.response ? (
                  <div
                    className={cn(
                      "p-3 rounded-md border cursor-pointer transition-all duration-200 flex items-center justify-between",
                      isResponseSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "hover:bg-muted/50 border-border hover:border-border/80"
                    )}
                    onClick={() => onFileSelect(pair.response!)}
                  >
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 text-xs font-medium flex items-center gap-1">
                        <Download className="h-3 w-3" />
                        응답
                      </Badge>
                    </div>
                    <div className="text-xs opacity-60">
                      {formatFileSize(pair.response.size)}
                    </div>
                  </div>
                ) : pair.request && (
                  <div className="p-3 rounded-md border border-dashed border-muted-foreground/30 text-center text-muted-foreground">
                    <div className="text-xs">
                      응답 대기 중...
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {files.length === 0 && (
        <div className="text-center text-muted-foreground p-8">
          <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <h4 className="font-medium text-sm mb-1">로그 파일 없음</h4>
          <p className="text-xs opacity-70">AI Agent가 실행되면 로그가 생성됩니다</p>
        </div>
      )}
    </div>
  )
}