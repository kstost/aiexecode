'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { LogFile } from '@/types/log'
import { fetchApi } from '@/lib/api'
import * as React from 'react'
import { Edit, Play, Save, AlertCircle, CheckCircle, Loader, TreePine, Code2, FormInput } from 'lucide-react'
import dynamic from 'next/dynamic'
import toast from 'react-hot-toast'
import { TreeView } from '@/components/ui/tree-view'
import { JsonFormEditor } from './json-form-editor'
import { JsonResponseViewer } from './json-response-viewer'
import { InputEditor } from './input-editor'
import { JsonValue } from '@/types/json'
import type { editor, IDisposable } from 'monaco-editor'

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
)

// Extended Monaco Editor types for auto-height functionality
type ExtendedEditor = editor.IStandaloneCodeEditor & {
  getContentHeight?: () => number
  _heightSubscription?: IDisposable
}

interface RequestEditorProps {
  selectedFile: LogFile | null
  onFileUpdate: () => void
}

interface ExecutionResult {
  success: boolean
  response?: unknown
  error?: string
  executionTime?: number
}

export function RequestEditor({ selectedFile, onFileUpdate }: RequestEditorProps) {
  const [editedContent, setEditedContent] = useState<string>('')
  const [parsedData, setParsedData] = useState<JsonValue>(null)
  const [editMode, setEditMode] = useState<'code' | 'tree' | 'form'>('form')
  const [scrollPositions, setScrollPositions] = useState<Record<string, number>>({})
  const [treeExpandedNodes, setTreeExpandedNodes] = useState<Set<string>>(new Set())
  const scrollAreaRefs = React.useRef<Record<string, HTMLDivElement | null>>({})
  const [loading, setLoading] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null)
  const [showExecuteDialog, setShowExecuteDialog] = useState(false)
  const [currentView, setCurrentView] = useState<'editor' | 'result'>('editor')
  const [apiProvider, setApiProvider] = useState<'openai' | 'anthropic'>('openai')

  // Monaco Editor refs and state
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ExtendedEditor | null>(null)
  const [editorHeight, setEditorHeight] = useState(0)

  // Monaco Editor height management - content-based with no limits
  const updateEditorHeight = React.useCallback((contentHeight: number) => {
    // Add padding to prevent scrollbar due to height calculation precision issues
    const EXTRA_PADDING = 10
    const newHeight = Math.max(contentHeight + EXTRA_PADDING, 100) // Minimum height of 100px

    if (Math.abs(newHeight - editorHeight) > 1) { // Prevent minor fluctuations
      setEditorHeight(newHeight)

      // Update container height immediately
      if (editorContainerRef.current) {
        editorContainerRef.current.style.height = `${newHeight}px`
      }

      // Trigger editor layout after height change
      if (editorRef.current) {
        requestAnimationFrame(() => {
          editorRef.current?.layout()
        })
      }
    }
  }, [editorHeight])

  const handleEditorDidMount = React.useCallback((editor: editor.IStandaloneCodeEditor) => {
    // Clean up any previous editor reference
    if (editorRef.current && editorRef.current !== editor) {
      const prevSubscription = editorRef.current._heightSubscription
      if (prevSubscription) {
        prevSubscription.dispose()
      }
    }

    editorRef.current = editor as ExtendedEditor

    // Set up content size change listener for auto height
    const contentSizeSubscription = editor.onDidContentSizeChange((e) => {
      updateEditorHeight(e.contentHeight)
    })

    // Store subscription for cleanup
    const extendedEditor = editorRef.current as ExtendedEditor
    if (extendedEditor) {
      extendedEditor._heightSubscription = contentSizeSubscription
    }

    // Disable wheel events on Monaco Editor DOM element
    setTimeout(() => {
      const editorDomNode = editor.getDomNode()
      if (editorDomNode) {
        // Use capture phase to intercept before Monaco handles it
        editorDomNode.addEventListener('wheel', (e) => {
          // Find scroll area and directly scroll it
          let parent = editorContainerRef.current?.parentElement
          while (parent) {
            if (parent.hasAttribute('data-radix-scroll-area-viewport') ||
                parent.querySelector('[data-radix-scroll-area-viewport]')) {
              const viewport = parent.hasAttribute('data-radix-scroll-area-viewport')
                ? parent
                : parent.querySelector('[data-radix-scroll-area-viewport]')

              if (viewport) {
                viewport.scrollTop += e.deltaY
                e.preventDefault()
                e.stopPropagation()
                break
              }
            }
            parent = parent.parentElement
          }
        }, { passive: false, capture: true })
      }

      const initialContentHeight = editor.getContentHeight()
      updateEditorHeight(initialContentHeight)
      editor.layout()
    }, 100)
  }, [updateEditorHeight])

  // Handle wheel events on editor container to propagate to parent
  const handleContainerWheel = React.useCallback((e: React.WheelEvent) => {
    // Find ScrollArea component by looking for data-radix-scroll-area-viewport
    let parent = e.currentTarget.parentElement
    while (parent) {
      if (parent.hasAttribute('data-radix-scroll-area-viewport') ||
          parent.classList.contains('scroll-area') ||
          parent.querySelector('[data-radix-scroll-area-viewport]')) {
        const viewport = parent.hasAttribute('data-radix-scroll-area-viewport')
          ? parent
          : parent.querySelector('[data-radix-scroll-area-viewport]')

        if (viewport) {
          // Use smooth scroll behavior for natural feeling
          const currentScrollTop = viewport.scrollTop
          const scrollAmount = e.deltaY

          viewport.scrollTo({
            top: currentScrollTop + scrollAmount,
            behavior: 'auto' // Use 'auto' for immediate response, not 'smooth'
          })

          e.preventDefault()
          break
        }
      }
      parent = parent.parentElement
    }
  }, [])

  // Cleanup function for Monaco Editor
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        const subscription = editorRef.current._heightSubscription
        if (subscription) {
          subscription.dispose()
        }
        // Don't dispose the editor here as it might be needed for remounting
        // The editor will be disposed automatically by Monaco when component unmounts
      }
    }
  }, [])

  // Save current scroll position when switching modes
  const saveScrollPosition = React.useCallback((mode: string) => {
    const scrollArea = scrollAreaRefs.current[mode]
    if (scrollArea) {
      const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        setScrollPositions(prev => ({
          ...prev,
          [mode]: viewport.scrollTop
        }))
      }
    }
  }, [])

  // Restore scroll position when entering a mode
  const restoreScrollPosition = React.useCallback((mode: string) => {
    const scrollArea = scrollAreaRefs.current[mode]
    const savedPosition = scrollPositions[mode]

    if (scrollArea && typeof savedPosition === 'number') {
      const viewport = scrollArea.querySelector('[data-radix-scroll-area-viewport]')
      if (viewport) {
        setTimeout(() => {
          viewport.scrollTop = savedPosition
        }, 10)
      }
    }
  }, [scrollPositions])

  // Handle mode change with scroll position saving/restoring
  const handleModeChange = React.useCallback((newMode: 'code' | 'tree' | 'form') => {
    // 실행결과 화면에서 모드 변경 시 자동으로 편집기 화면으로 전환
    if (currentView === 'result') {
      setCurrentView('editor')
    }

    // Save current scroll position
    saveScrollPosition(editMode)

    // Change mode
    setEditMode(newMode)

    // Restore scroll position for new mode
    setTimeout(() => {
      restoreScrollPosition(newMode)

      // If switching to code mode, trigger layout recalculation
      if (newMode === 'code' && editorRef.current) {
        setTimeout(() => {
          editorRef.current?.layout()
        }, 50)
      }
    }, 50)
  }, [editMode, currentView, saveScrollPosition, restoreScrollPosition])

  const loadRequestData = React.useCallback(async () => {
    if (!selectedFile) return

    try {
      setLoading(true)
      const response = await fetchApi(`/api/logs/${encodeURIComponent(selectedFile.name)}`)
      if (!response.ok) throw new Error('Failed to load file')

      const data = await response.json()
      const payload = data.data || data
      setEditedContent(JSON.stringify(payload, null, 2))
      setParsedData(payload)
      
      // provider 자동 감지
      let detectedProvider: 'openai' | 'anthropic' = 'openai'
      
      // 1. 명시적 provider 정보가 있으면 사용
      if (data.provider) {
        detectedProvider = data.provider
      } else if (payload.provider) {
        detectedProvider = payload.provider
      } else {
        // 2. 로그 구조로 판단
        // Anthropic 특징:
        //   - 요청: messages 배열, max_tokens
        //   - 응답: content 배열 (type: "message")
        //   - 모델: claude-로 시작
        // OpenAI 특징:
        //   - 요청: input 배열
        //   - 응답: output 배열
        //   - 모델: gpt- 또는 o1-로 시작
        const hasMessages = 'messages' in payload && Array.isArray(payload.messages)
        const hasInput = 'input' in payload && Array.isArray(payload.input)
        const hasOutput = 'output' in payload && Array.isArray(payload.output)
        const hasMaxTokens = 'max_tokens' in payload
        const hasContent = 'content' in payload && Array.isArray(payload.content)
        const model = payload.model || ''
        
        if (hasMessages || hasMaxTokens || hasContent || model.startsWith('claude-')) {
          detectedProvider = 'anthropic'
        } else if (hasInput || hasOutput || model.startsWith('gpt-') || model.startsWith('o1-')) {
          detectedProvider = 'openai'
        }
      }
      
      setApiProvider(detectedProvider)
    } catch {
      toast.error('파일 로드 실패')
    } finally {
      setLoading(false)
    }
  }, [selectedFile])

  useEffect(() => {
    if (selectedFile && (selectedFile.parsedInfo?.type === 'REQ' || selectedFile.parsedInfo?.type === 'RES')) {
      // Reset editor height when loading new file
      setEditorHeight(100)
      if (editorContainerRef.current) {
        editorContainerRef.current.style.height = '100px'
      }
      // 새 파일 로드 시 실행결과 및 뷰 상태 초기화
      setExecutionResult(null)
      setCurrentView('editor')
      loadRequestData()
    } else {
      setEditedContent('')
      setParsedData(null)
      setEditorHeight(100)
      if (editorContainerRef.current) {
        editorContainerRef.current.style.height = '100px'
      }
      // 파일이 선택되지 않았을 때도 실행결과 초기화
      setExecutionResult(null)
      setCurrentView('editor')
    }
  }, [selectedFile, loadRequestData])


  const validateJson = (content: string): boolean => {
    try {
      JSON.parse(content)
      return true
    } catch {
      return false
    }
  }

  const handleTreeChange = (newData: JsonValue) => {
    setParsedData(newData)
    setEditedContent(JSON.stringify(newData, null, 2))
  }

  const handleCodeChange = (value: string | undefined) => {
    const newContent = value || ''
    setEditedContent(newContent)

    if (validateJson(newContent)) {
      try {
        setParsedData(JSON.parse(newContent))
      } catch {
        // Keep existing parsed data if JSON is invalid
      }
    }
  }

  const saveChanges = async () => {
    if (!selectedFile || !validateJson(editedContent)) {
      toast.error('유효하지 않은 JSON 형식입니다')
      return
    }

    try {
      const response = await fetchApi(`/api/logs/${encodeURIComponent(selectedFile.name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: editedContent
      })

      if (response.ok) {
        toast.success('파일이 저장되었습니다')
        onFileUpdate()
      } else {
        toast.error('저장 실패')
      }
    } catch {
      toast.error('저장 중 오류가 발생했습니다')
    }
  }

  const renderEditor = () => {
    if (editMode === 'form') {
      return (
        <ScrollArea
          key="form-scroll"
          className="h-full"
          ref={(el) => { scrollAreaRefs.current['form'] = el }}
        >
          <div className="space-y-4">
            {parsedData ? (
              parsedData && typeof parsedData === 'object' && parsedData !== null &&
              'input' in parsedData && Array.isArray(parsedData.input) ? (
                <div className="space-y-4">
                  <InputEditor
                    data={parsedData.input}
                    onChange={(updatedInput) => {
                      const updatedData = { ...parsedData as Record<string, JsonValue>, input: updatedInput }
                      handleTreeChange(updatedData)
                    }}
                    className="h-full"
                  />
                  <JsonFormEditor
                    data={Object.fromEntries(Object.entries(parsedData as Record<string, JsonValue>).filter(([key]) => key !== 'input')) as JsonValue}
                    onChange={(otherFields) => {
                      const updatedData = { ...otherFields as Record<string, JsonValue>, input: (parsedData as Record<string, JsonValue>).input }
                      handleTreeChange(updatedData)
                    }}
                    className="h-full"
                  />
                </div>
              ) : (
                <JsonFormEditor
                  data={parsedData}
                  onChange={handleTreeChange}
                  className="h-full"
                />
              )
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <FormInput className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>JSON 데이터를 파싱할 수 없습니다</p>
                <p className="text-sm">코드 편집기에서 유효한 JSON을 입력하세요</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )
    }

    if (editMode === 'code') {
      return (
        <ScrollArea
          key="code-scroll"
          className="h-full"
          ref={(el) => { scrollAreaRefs.current['code'] = el }}
        >
          <>
            <div
              ref={editorContainerRef}
              className="border rounded-lg overflow-hidden mb-4"
              style={{ height: `${editorHeight}px` }}
              onWheel={handleContainerWheel}
            >
              <MonacoEditor
                height="100%"
                defaultLanguage="json"
                theme="vs-dark"
                value={editedContent}
                onChange={handleCodeChange}
                onMount={handleEditorDidMount}
                options={{
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  fontSize: 14,
                  lineNumbers: 'on',
                  renderWhitespace: 'selection',
                  folding: true,
                  wordWrap: 'on',
                  formatOnType: true,
                  formatOnPaste: true,
                  automaticLayout: false,
                  scrollbar: {
                    vertical: 'hidden',
                    verticalScrollbarSize: 0,
                    horizontal: 'auto',
                    horizontalScrollbarSize: 10
                  },
                  overviewRulerLanes: 0,
                  hideCursorInOverviewRuler: true,
                  overviewRulerBorder: false,
                  mouseWheelScrollSensitivity: 0
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              {validateJson(editedContent) ? (
                <div className="flex items-center text-sm text-green-600">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  유효한 JSON
                </div>
              ) : (
                <div className="flex items-center text-sm text-red-600">
                  <AlertCircle className="h-4 w-4 mr-1" />
                  유효하지 않은 JSON
                </div>
              )}
            </div>
          </>
        </ScrollArea>
      )
    }

    if (editMode === 'tree') {
      return (
        <ScrollArea
          key="tree-scroll"
          className="h-full"
          ref={(el) => { scrollAreaRefs.current['tree'] = el }}
        >
          <div className="space-y-4">
            {parsedData ? (
              <TreeView
                data={parsedData}
                onChange={handleTreeChange}
                className="h-full"
                expandedNodes={treeExpandedNodes}
                onExpandedNodesChange={setTreeExpandedNodes}
                expandAllByDefault={true}
              />
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                <TreePine className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>JSON 데이터를 파싱할 수 없습니다</p>
                <p className="text-sm">코드 편집기에서 유효한 JSON을 입력하세요</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )
    }

    return null
  }

  const executeRequest = async () => {
    if (!validateJson(editedContent)) {
      toast.error('유효하지 않은 JSON 형식입니다')
      return
    }

    try {
      setExecuting(true)
      const startTime = Date.now()

      const endpoint = apiProvider === 'anthropic' ? '/api/test-anthropic' : '/api/test-openai'
      const response = await fetchApi(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: editedContent
      })

      const result = await response.json()
      const executionTime = Date.now() - startTime

      setExecutionResult({
        success: response.ok,
        response: result,
        error: response.ok ? undefined : result.error,
        executionTime
      })

      // 실행 완료 후 자동으로 실행결과 뷰로 전환
      setCurrentView('result')

      if (response.ok) {
        toast.success(`${apiProvider === 'anthropic' ? 'Anthropic' : 'OpenAI'} 요청이 성공적으로 실행되었습니다`)
        onFileUpdate()
      } else {
        toast.error('요청 실행 실패')
      }
    } catch (error) {
      setExecutionResult({
        success: false,
        error: error instanceof Error ? error.message : '알 수 없는 오류'
      })
      // 에러 발생 시에도 실행결과 뷰로 전환
      setCurrentView('result')
      toast.error('실행 중 오류가 발생했습니다')
    } finally {
      setExecuting(false)
      setShowExecuteDialog(false)
    }
  }

  if (!selectedFile) {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <Edit className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">REQ 파일을 선택하세요</p>
            <p className="text-sm">요청 파일을 선택하면 내용을 편집하고 재실행할 수 있습니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Handle RES files with viewer-only mode
  if (selectedFile.parsedInfo?.type === 'RES') {
    return (
      <div className="h-full flex flex-col">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <JsonResponseViewer
            data={parsedData}
            className="h-full"
          />
        )}
      </div>
    )
  }

  if (selectedFile.parsedInfo?.type !== 'REQ') {
    return (
      <Card className="h-full">
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg">지원하지 않는 파일 타입입니다</p>
            <p className="text-sm">REQ 또는 RES 파일만 지원됩니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full flex flex-col !border-none !rounded-none">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            요청 편집기: {selectedFile.name}
          </span>
          <div className="flex items-center gap-4">
            {/* 탭 그룹: 화면 전환 */}
            <div className="flex items-center bg-muted rounded-lg p-1">
              <Button
                variant={editMode === 'form' && currentView === 'editor' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('form')}
                className="h-8"
              >
                <FormInput className="h-4 w-4 mr-1" />
                폼
              </Button>
              <Button
                variant={editMode === 'code' && currentView === 'editor' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('code')}
                className="h-8"
              >
                <Code2 className="h-4 w-4 mr-1" />
                코드
              </Button>
              <Button
                variant={editMode === 'tree' && currentView === 'editor' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleModeChange('tree')}
                className="h-8"
              >
                <TreePine className="h-4 w-4 mr-1" />
                트리
              </Button>
              {executionResult && (
                <Button
                  variant={currentView === 'result' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setCurrentView('result')}
                  className="h-8"
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  실행결과
                </Button>
              )}
            </div>

            {/* 액션 버튼들: 기능 실행 */}
            <div className="flex items-center gap-2">
              <div className="hidden flex items-center gap-1 mr-2 px-2 py-1 border rounded-md bg-muted/30">
                <Button
                  size="sm"
                  variant={apiProvider === 'openai' ? 'default' : 'ghost'}
                  onClick={() => setApiProvider('openai')}
                  className="h-6 px-2"
                >
                  OpenAI
                </Button>
                <Button
                  size="sm"
                  variant={apiProvider === 'anthropic' ? 'default' : 'ghost'}
                  onClick={() => setApiProvider('anthropic')}
                  className="h-6 px-2"
                >
                  Anthropic
                </Button>
              </div>
              <Button
                onClick={saveChanges}
                variant="outline"
                size="sm"
                disabled={loading || !validateJson(editedContent)}
              >
                <Save className="h-4 w-4 mr-2" />
                저장
              </Button>
              <Dialog open={showExecuteDialog} onOpenChange={setShowExecuteDialog}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    disabled={loading || executing || !validateJson(editedContent)}
                  >
                    {executing ? (
                      <Loader className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    실행
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>요청 실행 확인</DialogTitle>
                    <DialogDescription>
                      {apiProvider === 'anthropic' ? 'Anthropic Claude' : 'OpenAI'} API 요청을 실행하시겠습니까?
                      <br />
                      이 작업은 실제 AI 모델을 호출합니다.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-2 mt-4">
                    <Button variant="outline" onClick={() => setShowExecuteDialog(false)}>
                      취소
                    </Button>
                    <Button onClick={executeRequest} disabled={executing}>
                      {executing ? (
                        <Loader className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      실행
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader className="h-6 w-6 animate-spin" />
          </div>
        ) : currentView === 'result' && executionResult ? (
          <ScrollArea
            key="result-scroll"
            className="h-full"
            ref={(el) => { scrollAreaRefs.current['result'] = el }}
          >
            {executionResult.success ? (
              <div className="h-full">
                <JsonResponseViewer
                  data={executionResult.response as JsonValue}
                  className="h-full"
                />
              </div>
            ) : (
              <div className="bg-red-50 border border-red-200 p-4 rounded-lg">
                <p className="text-red-800">{executionResult.error}</p>
              </div>
            )}
          </ScrollArea>
        ) : (
          renderEditor()
        )}
      </CardContent>
    </Card>
  )
}