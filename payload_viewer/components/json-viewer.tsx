'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatTimestamp } from '@/lib/utils'
import { User, Settings, Zap, BarChart3, MessageSquare, Wrench, Code2 } from 'lucide-react'
import { CustomAccordion } from './custom-accordion'

interface JsonViewerProps {
  data: {
    taskName: string
    timestamp: string
    provider?: 'openai' | 'anthropic'
    data: {
      model?: string
      provider?: 'openai' | 'anthropic'
      input?: Array<{
        role: string
        content: Array<{
          type: string
          text: string
        }>
      }>
      tools?: Array<{ name: string }>
      output?: Array<{
        type: string
        status?: string
        name?: string
        arguments?: string
        output?: string
        content?: Array<{
          type: string
          text: string
        }>
      }>
      usage?: {
        input_tokens: number
        output_tokens: number
        total_tokens: number
        cache_creation_input_tokens?: number
        cache_read_input_tokens?: number
      }
      id?: string
      status?: string
      created_at?: number
      stop_reason?: string
      stop_sequence?: string | null
    }
  }
  expandedMessages?: Set<string>
  expandedOutputs?: Set<string>
  onMessageToggle?: (messageId: string) => void
  onOutputToggle?: (outputId: string) => void
}

export function JsonViewer({
  data,
  expandedMessages = new Set(),
  expandedOutputs = new Set(),
  onMessageToggle = () => {},
  onOutputToggle = () => {}
}: JsonViewerProps) {
  // Debug logging
  React.useEffect(() => {
    console.log('JsonViewer mounted/updated:', {
      expandedMessages: Array.from(expandedMessages),
      expandedOutputs: Array.from(expandedOutputs),
      taskName: data?.taskName,
      timestamp: new Date().toISOString()
    })
  })
  const renderTaskInfo = () => {
    const provider = data.provider || data.data?.provider
    
    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="h-5 w-5" />
            작업 정보
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{data.taskName}</Badge>
            {provider && (
              <Badge variant={provider === 'anthropic' ? 'secondary' : 'default'}>
                {provider === 'anthropic' ? '🤖 Anthropic' : '🤖 OpenAI'}
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {formatTimestamp(data.timestamp)}
            </span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderRequestData = () => {
    const payload = data.data || data
    if (!payload.input) return null

    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <User className="h-5 w-5" />
            요청 데이터
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium mb-2">모델</div>
            <Badge>{payload.model}</Badge>
          </div>

          <div>
            <div className="text-sm font-medium mb-3 flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              메시지 ({payload.input.length}개)
            </div>
            <CustomAccordion
              items={payload.input.map((message, index) => ({
                id: `message-${index}`,
                title: (
                  <div className="flex items-center gap-2">
                    <Badge variant={message.role === 'system' ? 'secondary' : message.role === 'user' ? 'default' : 'outline'}>
                      {message.role}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {message.content?.[0]?.text?.substring(0, 50)}...
                    </span>
                  </div>
                ),
                content: (
                  <div className="space-y-2 pt-2">
                    {message.content?.map((content, contentIndex) => (
                      <div key={contentIndex} className="bg-muted p-3 rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <Code2 className="h-3 w-3" />
                          <Badge variant="outline" className="text-xs">
                            {content.type}
                          </Badge>
                        </div>
                        {content.type === 'input_text' && (
                          <p className="text-sm whitespace-pre-wrap text-foreground leading-relaxed">
                            {content.text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )
              }))}
              expandedIds={expandedMessages}
              onToggle={onMessageToggle}
            />
          </div>

          {payload.tools && payload.tools.length > 0 && (
            <>
              <Separator />
              <div>
                <div className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  사용 가능한 도구 ({payload.tools.length}개)
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {payload.tools.map((tool, index) => (
                    <Card key={index} className="p-2">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-xs">
                          {tool.name}
                        </Badge>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  const renderResponseData = () => {
    const payload = data.data || data
    if (!payload.output) return null

    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Zap className="h-5 w-5" />
            응답 데이터
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-sm font-medium">응답 ID</div>
              <div className="text-xs text-muted-foreground font-mono">
                {payload.id?.substring(0, 12)}...
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">상태</div>
              <Badge variant={payload.status === 'completed' ? 'default' : 'destructive'}>
                {payload.status}
              </Badge>
            </div>
            <div>
              <div className="text-sm font-medium">모델</div>
              <div className="text-xs text-muted-foreground">
                {payload.model}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium">생성 시간</div>
              <div className="text-xs text-muted-foreground">
                {payload.created_at && new Date(payload.created_at * 1000).toLocaleString()}
              </div>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3 flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              출력 항목 ({payload.output.length}개)
            </div>
            <CustomAccordion
              items={payload.output.map((output, index) => ({
                id: `output-${index}`,
                title: (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{output.type}</Badge>
                    {output.status && (
                      <Badge variant={output.status === 'completed' ? 'default' : 'destructive'}>
                        {output.status}
                      </Badge>
                    )}
                    {output.name && (
                      <span className="text-sm text-muted-foreground">{output.name}</span>
                    )}
                  </div>
                ),
                content: (
                  <div className="space-y-3 pt-2">
                    {output.type === 'function_call' && (
                      <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Wrench className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">{output.name}</span>
                        </div>
                        {output.arguments && (
                          <div className="text-xs font-mono bg-white dark:bg-gray-900 p-2 rounded border max-h-32 overflow-auto">
                            <pre>{JSON.stringify(JSON.parse(output.arguments), null, 2)}</pre>
                          </div>
                        )}
                      </div>
                    )}

                    {output.type === 'function_call_output' && (
                      <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Code2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm font-medium text-green-900 dark:text-green-100">함수 실행 결과</span>
                        </div>
                        <div className="text-xs font-mono bg-white dark:bg-gray-900 p-2 rounded border max-h-40 overflow-auto">
                          <pre>
                            {output.output && (() => {
                              try {
                                return JSON.stringify(JSON.parse(output.output), null, 2)
                              } catch {
                                return output.output
                              }
                            })()}
                          </pre>
                        </div>
                      </div>
                    )}

                    {output.type === 'message' && output.content && (
                      <div className="bg-gray-50 dark:bg-gray-950/20 p-3 rounded-lg border border-gray-200 dark:border-gray-800">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-gray-600" />
                          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">메시지 내용</span>
                        </div>
                        <div className="space-y-2">
                          {output.content.map((content, contentIndex) => (
                            <div key={contentIndex}>
                              {content.type === 'output_text' && (
                                <div className="text-sm bg-white dark:bg-gray-900 p-2 rounded border">
                                  <p className="whitespace-pre-wrap leading-relaxed">
                                    {content.text}
                                  </p>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              }))}
              expandedIds={expandedOutputs}
              onToggle={onOutputToggle}
            />
          </div>
        </CardContent>
      </Card>
    )
  }

  const renderUsageData = () => {
    const payload = data.data || data
    if (!payload.usage) return null

    const { 
      input_tokens, 
      output_tokens, 
      total_tokens,
      cache_creation_input_tokens,
      cache_read_input_tokens
    } = payload.usage
    
    const inputPercentage = (input_tokens / total_tokens) * 100
    const outputPercentage = (output_tokens / total_tokens) * 100
    
    const hasCacheData = cache_creation_input_tokens || cache_read_input_tokens
    const provider = data.provider || data.data?.provider

    return (
      <Card className="mb-4">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            사용량 통계
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{input_tokens.toLocaleString()}</div>
              <div className="text-sm text-blue-700 dark:text-blue-300">입력 토큰</div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">{inputPercentage.toFixed(1)}%</div>
            </div>
            <div className="text-center p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">{output_tokens.toLocaleString()}</div>
              <div className="text-sm text-green-700 dark:text-green-300">출력 토큰</div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">{outputPercentage.toFixed(1)}%</div>
            </div>
            <div className="text-center p-4 bg-gray-50 dark:bg-gray-950/20 rounded-lg border border-gray-200 dark:border-gray-800">
              <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">{total_tokens.toLocaleString()}</div>
              <div className="text-sm text-gray-700 dark:text-gray-300">총 토큰</div>
              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">100%</div>
            </div>
          </div>

          {/* Anthropic Cache Statistics */}
          {hasCacheData && provider === 'anthropic' && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                  {cache_creation_input_tokens?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-purple-700 dark:text-purple-300">캐시 생성 토큰</div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Cache Write</div>
              </div>
              <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                  {cache_read_input_tokens?.toLocaleString() || 0}
                </div>
                <div className="text-sm text-orange-700 dark:text-orange-300">캐시 읽기 토큰</div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Cache Hit (90% 절약)</div>
              </div>
            </div>
          )}

          {/* Token usage visualization bar */}
          <div className="space-y-2">
            <div className="text-sm font-medium">토큰 비율</div>
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
              <div
                className="bg-blue-500 h-full"
                style={{ width: `${inputPercentage}%` }}
              />
              <div
                className="bg-green-500 h-full"
                style={{ width: `${outputPercentage}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>입력: {inputPercentage.toFixed(1)}%</span>
              <span>출력: {outputPercentage.toFixed(1)}%</span>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {renderTaskInfo()}
      {renderRequestData()}
      {renderResponseData()}
      {renderUsageData()}
    </div>
  )
}