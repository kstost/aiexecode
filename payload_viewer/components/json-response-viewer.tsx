'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TreeView } from '@/components/ui/tree-view'
import { JsonValue } from '@/types/json'
import {
  Copy,
  Type,
  Hash,
  ToggleLeft,
  List,
  FileText,
  Eye,
  Code2,
  Download,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'

interface JsonResponseViewerProps {
  data: JsonValue
  className?: string
}

type JsonFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'

interface JsonField {
  key: string
  value: JsonValue
  type: JsonFieldType
  path: string[]
  level: number
}

function getJsonType(value: JsonValue): JsonFieldType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as JsonFieldType
}

function flattenJsonForViewing(obj: JsonValue, path: string[] = [], level: number = 0): JsonField[] {
  const fields: JsonField[] = []

  if (obj === null) {
    return [{ key: path.join('.') || 'root', value: null, type: 'null', path, level }]
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const currentPath = [...path, `[${index}]`]
      fields.push({
        key: currentPath.join('.'),
        value: item,
        type: getJsonType(item),
        path: currentPath,
        level
      })
      if (typeof item === 'object' && item !== null) {
        fields.push(...flattenJsonForViewing(item, currentPath, level + 1))
      }
    })
  } else if (typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = [...path, key]
      fields.push({
        key: currentPath.join('.'),
        value,
        type: getJsonType(value),
        path: currentPath,
        level
      })
      if (typeof value === 'object' && value !== null) {
        fields.push(...flattenJsonForViewing(value, currentPath, level + 1))
      }
    })
  } else {
    fields.push({
      key: path.join('.') || 'root',
      value: obj,
      type: getJsonType(obj),
      path,
      level
    })
  }

  return fields
}

function TreeNode({ field, expanded, onToggle, searchTerm }: {
  field: JsonField
  expanded: boolean
  onToggle: () => void
  searchTerm: string
}) {
  const isExpandable = field.type === 'object' || field.type === 'array'
  const isMatch = searchTerm && (
    field.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(field.value).toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getTypeIcon = (type: JsonFieldType) => {
    switch (type) {
      case 'string':
        return <Type className="h-3 w-3" />
      case 'number':
        return <Hash className="h-3 w-3" />
      case 'boolean':
        return <ToggleLeft className="h-3 w-3" />
      case 'array':
        return <List className="h-3 w-3" />
      case 'object':
        return <FileText className="h-3 w-3" />
      default:
        return <FileText className="h-3 w-3" />
    }
  }

  const getTypeColor = (type: JsonFieldType) => {
    switch (type) {
      case 'string':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'number':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'boolean':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'array':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'object':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
      case 'null':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const renderValue = (value: JsonValue, type: JsonFieldType) => {
    switch (type) {
      case 'string':
        return (
          <span className="text-green-600 dark:text-green-400 font-mono">
            &quot;{String(value)}&quot;
          </span>
        )
      case 'number':
        return (
          <span className="text-blue-600 dark:text-blue-400 font-mono">
            {Number(value)}
          </span>
        )
      case 'boolean':
        return (
          <span className="text-purple-600 dark:text-purple-400 font-mono">
            {String(value)}
          </span>
        )
      case 'null':
        return (
          <span className="text-gray-500 dark:text-gray-400 font-mono italic">
            null
          </span>
        )
      case 'array':
        const arrayLength = Array.isArray(value) ? value.length : 0
        return (
          <span className="text-orange-600 dark:text-orange-400 font-mono">
            Array({arrayLength})
          </span>
        )
      case 'object':
        const objectKeys = typeof value === 'object' && value !== null ? Object.keys(value).length : 0
        return (
          <span className="text-red-600 dark:text-red-400 font-mono">
            Object({objectKeys})
          </span>
        )
      default:
        return <span>{String(value)}</span>
    }
  }

  return (
    <div
      className={`flex items-center gap-2 py-1 px-2 rounded ${
        isMatch ? 'bg-yellow-100 dark:bg-yellow-900/30' : ''
      }`}
      style={{ marginLeft: `${field.level * 16}px` }}
    >
      {isExpandable ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggle}
          className="h-6 w-6 p-0"
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      ) : (
        <div className="w-6" />
      )}

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Badge
          variant="secondary"
          className={`text-xs ${getTypeColor(field.type)} flex items-center gap-1`}
        >
          {getTypeIcon(field.type)}
          {field.type}
        </Badge>

        <span className="font-mono text-sm text-muted-foreground">
          {field.path[field.path.length - 1] || 'root'}:
        </span>

        <div className="flex-1 min-w-0">
          {renderValue(field.value, field.type)}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(JSON.stringify(field.value, null, 2))
              toast.success('필드가 클립보드에 복사되었습니다')
            } catch (err) {
              console.log('Failed to copy field to clipboard:', err)
              // Fallback for older browsers
              const textArea = document.createElement('textarea')
              textArea.value = JSON.stringify(field.value, null, 2)
              document.body.appendChild(textArea)
              textArea.select()
              try {
                document.execCommand('copy')
                toast.success('필드가 클립보드에 복사되었습니다')
              } catch (fallbackErr) {
                console.log('Field fallback copy failed:', fallbackErr)
                toast.error('클립보드 복사에 실패했습니다')
              }
              document.body.removeChild(textArea)
            }
          }}
          className="h-6 w-6 p-0 opacity-50 hover:opacity-100"
        >
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// Helper function to check if data is AI agent response format
function isAIAgentResponse(data: JsonValue): boolean {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false
  const obj = data as Record<string, unknown>

  // Check for direct output array (new format like the user provided)
  if (Array.isArray(obj.output)) return true

  // Check for nested data.output array (old format)
  return !!(obj.data && typeof obj.data === 'object' && obj.data !== null &&
         Array.isArray((obj.data as Record<string, unknown>).output))
}

// Component for rendering AI agent response in a structured way
function AIAgentResponseViewer({ data }: { data: Record<string, unknown> }) {
  // Handle both formats: direct output array or nested data.output
  const response = Array.isArray(data.output) ? data : (data.data as Record<string, unknown>) || data

  // Initialize with all outputs expanded by default
  const outputArray = response.output && Array.isArray(response.output) ? response.output as unknown[] : []
  const [expandedOutputs, setExpandedOutputs] = useState<Set<number>>(
    new Set(outputArray.map((_, index) => index))
  )

  const toggleOutput = (index: number) => {
    const newExpanded = new Set(expandedOutputs)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedOutputs(newExpanded)
  }

  const getOutputIcon = (type: string) => {
    switch (type) {
      case 'reasoning': return '🧠'
      case 'function_call': return '🔧'
      case 'function_call_output': return '✅'
      case 'message': return '💬'
      default: return '📄'
    }
  }

  const getOutputTitle = (type: string) => {
    switch (type) {
      case 'reasoning': return '사고 과정'
      case 'function_call': return '도구 사용'
      case 'function_call_output': return '실행 결과'
      case 'message': return '응답'
      default: return '기타'
    }
  }

  const getOutputColor = (type: string) => {
    switch (type) {
      case 'reasoning': return 'bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800'
      case 'function_call': return 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800'
      case 'function_call_output': return 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800'
      case 'message': return 'bg-gray-50 dark:bg-gray-950/20 border-gray-200 dark:border-gray-800'
      default: return 'bg-muted/30 border-muted'
    }
  }

  const renderOutput = (output: Record<string, unknown>, index: number) => {
    const isExpanded = expandedOutputs.has(index)
    const type = String(output.type || 'unknown')

    return (
      <div key={index} className={`border rounded-lg overflow-hidden ${getOutputColor(type)}`}>
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => toggleOutput(index)}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">{getOutputIcon(type)}</span>
            <div>
              <div className="font-medium text-sm">{getOutputTitle(type)}</div>
              {output.name ? (
                <div className="text-xs text-muted-foreground">{String(output.name)}</div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {output.status ? (
              <Badge variant={output.status === 'completed' ? 'default' : 'destructive'} className="text-xs">
                {String(output.status)}
              </Badge>
            ) : null}
            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </div>
        </div>

        {isExpanded && (
          <div className="px-4 pb-4">
            {output.type === 'reasoning' && (
              <div className="bg-white/60 dark:bg-gray-900/60 p-3 rounded border">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 bg-purple-500 rounded-full" />
                  <span className="text-sm font-medium text-purple-900 dark:text-purple-100">AI 추론 과정</span>
                </div>
                <div className="text-sm text-purple-800 dark:text-purple-200 leading-relaxed">
                  {(() => {
                    // summary 필드 확인
                    if (output.summary) {
                      if (Array.isArray(output.summary)) {
                        return output.summary.map((item: unknown) => {
                          if (typeof item === 'object' && item !== null) {
                            const obj = item as Record<string, unknown>
                            return obj.text || JSON.stringify(item)
                          }
                          return String(item)
                        }).join(' ')
                      } else if (typeof output.summary === 'object') {
                        return JSON.stringify(output.summary, null, 2)
                      } else {
                        return String(output.summary)
                      }
                    }
                    // content 필드 확인
                    if (output.content) {
                      if (Array.isArray(output.content)) {
                        return output.content.map((item: unknown) =>
                          typeof item === 'object' && item !== null ? (item as Record<string, unknown>).text || JSON.stringify(item) : String(item)
                        ).join(' ')
                      } else if (typeof output.content === 'object') {
                        return JSON.stringify(output.content, null, 2)
                      } else {
                        return String(output.content)
                      }
                    }
                    // text 필드 확인
                    if (output.text) {
                      return String(output.text)
                    }
                    // 전체 output 표시 (디버그)
                    return JSON.stringify(output, null, 2)
                  })()}
                </div>
              </div>
            )}

            {output.type === 'function_call' && (
              <div className="bg-white/60 dark:bg-gray-900/60 p-3 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-blue-500 rounded-full">
                    <span className="text-white text-sm">🔧</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-blue-900 dark:text-blue-100">
                      {String(output.name || 'unknown')} 도구 호출
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>도구 호출됨</span>
                      {output.call_id ? (
                        <span className="bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded text-xs font-mono">
                          {String(output.call_id).substring(0, 12)}...
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {output.status ? (
                    <span className={`px-2 py-1 text-xs rounded ${
                      output.status === 'completed'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}>
                      {String(output.status)}
                    </span>
                  ) : null}
                </div>
                {output.arguments ? (
                  <div className="bg-blue-50/50 dark:bg-blue-950/30 p-2 rounded border border-blue-200/50">
                    <div className="text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">📋 입력 매개변수:</div>
                    <pre className="text-xs text-blue-700 dark:text-blue-300 overflow-auto max-h-32 bg-white/50 dark:bg-gray-800/50 p-2 rounded">
                      {(() => {
                        try {
                          return JSON.stringify(JSON.parse(String(output.arguments)), null, 2)
                        } catch {
                          return String(output.arguments)
                        }
                      })()}
                    </pre>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">매개변수 없음</div>
                )}
              </div>
            )}

            {output.type === 'function_call_output' && (
              <div className="bg-white/60 dark:bg-gray-900/60 p-3 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-green-500 rounded-full">
                    <span className="text-white text-sm">✅</span>
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-green-900 dark:text-green-100">도구 실행 완료</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>실행 결과 반환됨</span>
                      {output.call_id ? (
                        <span className="bg-green-100 dark:bg-green-900 px-2 py-0.5 rounded text-xs font-mono">
                          {String(output.call_id).substring(0, 12)}...
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                {output.output ? (
                  <div className="bg-green-50/50 dark:bg-green-950/30 p-2 rounded border border-green-200/50">
                    <div className="text-xs font-medium text-green-800 dark:text-green-200 mb-1">📊 실행 결과:</div>
                    <div className="bg-white/70 dark:bg-gray-800/70 p-2 rounded border">
                      {(() => {
                        try {
                          const parsed = JSON.parse(String(output.output))
                          // 특별한 처리: tool 실행 결과를 더 읽기 쉽게 표시
                          if (parsed.tool && parsed.stdout) {
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium text-green-700 dark:text-green-300">도구:</span>
                                  <code className="text-xs bg-green-100 dark:bg-green-900 px-1 py-0.5 rounded">
                                    {parsed.tool}
                                  </code>
                                  <span className="text-xs font-medium text-green-700 dark:text-green-300">상태:</span>
                                  <span className={`text-xs px-1 py-0.5 rounded ${
                                    parsed.exit_code === 0
                                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                      : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                  }`}>
                                    {parsed.exit_code === 0 ? '성공' : '실패'}
                                  </span>
                                </div>
                                {parsed.stdout && (
                                  <div>
                                    <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">출력:</div>
                                    <pre className="text-xs text-green-600 dark:text-green-400 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-2 rounded">
                                      {parsed.stdout}
                                    </pre>
                                  </div>
                                )}
                                {parsed.stderr && (
                                  <div>
                                    <div className="text-xs font-medium text-red-700 dark:text-red-300 mb-1">오류:</div>
                                    <pre className="text-xs text-red-600 dark:text-red-400 whitespace-pre-wrap bg-red-50 dark:bg-red-900/20 p-2 rounded">
                                      {parsed.stderr}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )
                          }

                          return (
                            <pre className="text-xs text-green-700 dark:text-green-300 overflow-auto max-h-40 leading-relaxed">
                              {JSON.stringify(parsed, null, 2)}
                            </pre>
                          )
                        } catch {
                          return (
                            <pre className="text-xs text-green-700 dark:text-green-300 overflow-auto max-h-40 leading-relaxed whitespace-pre-wrap">
                              {String(output.output)}
                            </pre>
                          )
                        }
                      })()}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">결과 없음</div>
                )}
              </div>
            )}

            {output.type === 'message' && (
              <div className="bg-white/60 dark:bg-gray-900/60 p-3 rounded border">
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center justify-center w-8 h-8 bg-indigo-500 rounded-full">
                    <span className="text-white text-sm">💬</span>
                  </div>
                  <div>
                    <div className="font-medium text-indigo-900 dark:text-indigo-100">최종 응답</div>
                    <div className="text-xs text-muted-foreground">
                      {output.role === 'assistant' ? 'AI 어시스턴트 응답' : `${String(output.role)} 메시지`}
                    </div>
                  </div>
                </div>
                {output.content && Array.isArray(output.content) ? (
                  <div className="space-y-2">
                    {(output.content as Record<string, unknown>[]).map((content, idx: number) => (
                      <div key={idx}>
                        {content.type === 'output_text' && (
                          <div className="bg-indigo-50/50 dark:bg-indigo-950/30 p-3 rounded border border-indigo-200/50">
                            <div className="text-xs font-medium text-indigo-800 dark:text-indigo-200 mb-2">💭 응답 내용:</div>
                            {(() => {
                              const textContent = String(content.text || '')

                              // JSON인지 확인
                              try {
                                const parsedJson = JSON.parse(textContent)
                                // JSON이면 TreeView로 표시
                                return (
                                  <div className="bg-white/70 dark:bg-gray-800/70 rounded border">
                                    <TreeView
                                      data={parsedJson}
                                      onChange={() => {}} // 읽기 전용
                                      expandAllByDefault={true}
                                      className="text-sm"
                                    />
                                  </div>
                                )
                              } catch {
                                // JSON이 아니면 기존 텍스트로 표시
                                return (
                                  <div className="text-sm text-indigo-900 dark:text-indigo-100 whitespace-pre-wrap leading-relaxed">
                                    {textContent}
                                  </div>
                                )
                              }
                            })()}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">메시지 내용 없음</div>
                )}
              </div>
            )}

            {!['reasoning', 'function_call', 'function_call_output', 'message'].includes(String(output.type)) && (
              <div className="bg-white/60 dark:bg-gray-900/60 p-3 rounded border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📄</span>
                  <div className="font-medium text-sm">알 수 없는 타입: {String(output.type)}</div>
                </div>
                <div className="bg-gray-50/50 dark:bg-gray-950/30 p-2 rounded border">
                  <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-auto max-h-40">
                    {JSON.stringify(output, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }


  return (
    <div className="space-y-4">
      {/* Response Info section temporarily removed due to TypeScript issues */}

      {/* Usage Information */}
      {response.usage && typeof response.usage === 'object' ? (
        <div className="p-4 bg-muted/30 rounded-lg space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">
                {Number((response.usage as Record<string, unknown>).input_tokens || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">입력 토큰</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-600">
                {Number((response.usage as Record<string, unknown>).output_tokens || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">출력 토큰</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-gray-600">
                {Number((response.usage as Record<string, unknown>).total_tokens || 0).toLocaleString()}
              </div>
              <div className="text-xs text-muted-foreground">총 토큰</div>
            </div>
          </div>
          
          {/* Anthropic Cache Statistics */}
          {((response.usage as Record<string, unknown>).cache_creation_input_tokens || 
            (response.usage as Record<string, unknown>).cache_read_input_tokens) && 
           (response.provider === 'anthropic' || data.provider === 'anthropic') ? (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="text-center p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                  {Number((response.usage as Record<string, unknown>).cache_creation_input_tokens || 0).toLocaleString()}
                </div>
                <div className="text-xs text-purple-700 dark:text-purple-300">캐시 생성 토큰</div>
                <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Cache Write</div>
              </div>
              <div className="text-center p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg border border-orange-200 dark:border-orange-800">
                <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {Number((response.usage as Record<string, unknown>).cache_read_input_tokens || 0).toLocaleString()}
                </div>
                <div className="text-xs text-orange-700 dark:text-orange-300">캐시 읽기 토큰</div>
                <div className="text-xs text-orange-600 dark:text-orange-400 mt-1">Cache Hit (90% 절약)</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* AI Execution Process */}
      {response.output && Array.isArray(response.output) && response.output.length > 0 ? (
        <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full">
              <span className="text-white font-bold">🚀</span>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-100">
                AI 실행 과정
              </h4>
              <p className="text-xs text-muted-foreground">
                총 {(response.output as unknown[]).length}단계의 처리 과정을 확인할 수 있습니다
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {(response.output as Record<string, unknown>[]).map((output, index: number) => renderOutput(output, index))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function JsonResponseViewer({ data, className = '' }: JsonResponseViewerProps) {
  const [fields, setFields] = useState<JsonField[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [filteredFields, setFilteredFields] = useState<JsonField[]>([])

  useEffect(() => {
    if (data) {
      const flattened = flattenJsonForViewing(data)
      setFields(flattened)

      // Auto-expand all levels by default
      const allExpandable = new Set(
        flattened
          .filter(field => field.type === 'object' || field.type === 'array')
          .map(field => field.key)
      )
      setExpandedNodes(allExpandable)
    }
  }, [data])

  useEffect(() => {
    if (searchTerm) {
      const filtered = fields.filter(field =>
        field.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(field.value).toLowerCase().includes(searchTerm.toLowerCase())
      )
      setFilteredFields(filtered)
    } else {
      setFilteredFields(fields)
    }
  }, [fields, searchTerm])

  const toggleNode = (key: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(key)) {
      newExpanded.delete(key)
    } else {
      newExpanded.add(key)
    }
    setExpandedNodes(newExpanded)
  }

  const expandAll = () => {
    const allExpandableKeys = fields
      .filter(field => field.type === 'object' || field.type === 'array')
      .map(field => field.key)
    setExpandedNodes(new Set(allExpandableKeys))
  }

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      toast.success('JSON이 클립보드에 복사되었습니다')
    } catch (err) {
      console.log('Failed to copy to clipboard:', err)
      // Fallback for older browsers
      const textArea = document.createElement('textarea')
      textArea.value = JSON.stringify(data, null, 2)
      document.body.appendChild(textArea)
      textArea.select()
      try {
        document.execCommand('copy')
        toast.success('JSON이 클립보드에 복사되었습니다')
      } catch (fallbackErr) {
        console.log('Fallback copy failed:', fallbackErr)
        toast.error('클립보드 복사에 실패했습니다')
      }
      document.body.removeChild(textArea)
    }
  }

  const downloadJson = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'response.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!data) {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No response data to display</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Check if this is an AI agent response and render accordingly
  // TEMPORARY: Force AI agent response for testing
  const dataObj = data as Record<string, unknown>
  const shouldShowAIResponse = isAIAgentResponse(data) ||
    (data && typeof data === 'object' && !Array.isArray(data) &&
     dataObj.data && typeof dataObj.data === 'object' &&
     Array.isArray((dataObj.data as Record<string, unknown>).output))

  console.log('Final decision:', {
    isAIAgent: isAIAgentResponse(data),
    shouldShow: shouldShowAIResponse,
    hasDataOutput: !!(dataObj?.data && typeof dataObj.data === 'object' &&
                     (dataObj.data as Record<string, unknown>).output)
  })

  if (shouldShowAIResponse) {
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <div className="h-full p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Eye className="h-5 w-5" />
                AI Agent Response
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={copyToClipboard}
              >
                <Copy className="h-4 w-4 mr-1" />
                Copy
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={downloadJson}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>
          </div>

          <Tabs defaultValue="structured" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
              <TabsTrigger value="structured" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                구조화된 뷰
              </TabsTrigger>
              <TabsTrigger value="tree" className="flex items-center gap-2">
                <List className="h-4 w-4" />
                트리 뷰
              </TabsTrigger>
            </TabsList>

            <TabsContent value="structured" className="flex-1 min-h-0 mt-4">
              <ScrollArea className="h-full">
                <div className="pr-4">
                  <AIAgentResponseViewer data={data as Record<string, unknown>} />
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="tree" className="flex-1 min-h-0 mt-4">
              <TreeView
                data={data}
                onChange={() => {}} // Read-only for AI responses
                expandAllByDefault={true}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="h-full p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Response Viewer
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={expandAll}
            >
              Expand All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={collapseAll}
            >
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={copyToClipboard}
            >
              <Copy className="h-4 w-4 mr-1" />
              Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={downloadJson}
            >
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search fields and values..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1"
          />
        </div>

        <Tabs defaultValue="tree" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 flex-shrink-0">
            <TabsTrigger value="tree" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Tree View
            </TabsTrigger>
            <TabsTrigger value="raw" className="flex items-center gap-2">
              <Code2 className="h-4 w-4" />
              Raw JSON
            </TabsTrigger>
          </TabsList>

          <TabsContent value="tree" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-full">
              <div className="space-y-1 pr-4">
                {filteredFields
                  .filter(field => {
                    // Show field if it's expanded or if its parent is expanded
                    if (field.level === 0) return true

                    const parentPath = field.path.slice(0, -1).join('.')
                    return expandedNodes.has(parentPath)
                  })
                  .map(field => (
                    <TreeNode
                      key={field.key}
                      field={field}
                      expanded={expandedNodes.has(field.key)}
                      onToggle={() => toggleNode(field.key)}
                      searchTerm={searchTerm}
                    />
                  ))
                }
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="raw" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-full">
              <div className="bg-muted p-4 rounded-lg mr-4">
                <pre className="text-sm font-mono whitespace-pre-wrap">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}