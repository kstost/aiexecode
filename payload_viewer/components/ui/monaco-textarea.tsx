'use client'

import React, { useRef, useCallback } from 'react'
import dynamic from 'next/dynamic'
import type { editor } from 'monaco-editor'

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false }
)

interface MonacoTextareaProps {
  value: string
  onChange: (value: string) => void
  language?: string
  height?: string | number
  className?: string
  id?: string
}

export function MonacoTextarea({
  value,
  onChange,
  language = 'json',
  height = '200px',
  className = '',
  id
}: MonacoTextareaProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null)

  const handleEditorDidMount = useCallback((editor: editor.IStandaloneCodeEditor) => {
    editorRef.current = editor

    // Focus the editor after mount
    setTimeout(() => {
      editor.layout()
    }, 100)
  }, [])

  const handleCodeChange = useCallback((newValue: string | undefined) => {
    const content = newValue || ''
    onChange(content)
  }, [onChange])

  return (
    <div
      id={id}
      className={`border rounded-lg overflow-hidden ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    >
      <MonacoEditor
        height="100%"
        width="100%"
        language={language}
        theme="vs-dark"
        value={value}
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
          automaticLayout: true,
          scrollbar: {
            vertical: 'auto',
            verticalScrollbarSize: 10,
            horizontal: 'auto',
            horizontalScrollbarSize: 10
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          contextmenu: true,
          selectOnLineNumbers: true,
          roundedSelection: false,
          readOnly: false,
          cursorStyle: 'line',
          mouseWheelScrollSensitivity: 1,
          smoothScrolling: false,
          cursorBlinking: 'blink',
          cursorSmoothCaretAnimation: 'off',
          renderFinalNewline: 'on',
          trimAutoWhitespace: true,
          acceptSuggestionOnCommitCharacter: true,
          acceptSuggestionOnEnter: 'on',
          tabSize: 2,
          insertSpaces: true,
          detectIndentation: true,
          renderLineHighlight: 'line',
          selectionHighlight: true,
          occurrencesHighlight: 'singleFile',
          codeLens: false,
          foldingHighlight: true,
          showUnused: true,
          showDeprecated: true
        }}
      />
    </div>
  )
}