'use client'

import React, { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { json } from '@codemirror/lang-json'
import { EditorView } from '@codemirror/view'

interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language?: 'json' | 'text'
  className?: string
  id?: string
  readOnly?: boolean
}

export function CodeEditor({
  value,
  onChange,
  language = 'json',
  className = '',
  id,
  readOnly = false
}: CodeEditorProps) {
  const formattedValue = useMemo(() => {
    if (language !== 'json' || !value.trim()) {
      return value
    }

    try {
      const parsed = JSON.parse(value)
      const formatted = JSON.stringify(parsed, null, 2)
      return formatted
    } catch {
      // Not valid JSON, return original
      return value
    }
  }, [value, language])

  const extensions = useMemo(() => {
    const exts = []

    // Language support
    if (language === 'json') {
      exts.push(json())
    }

    // Enable word wrap
    exts.push(EditorView.lineWrapping)

    // Auto height with proper content sizing
    exts.push(
      EditorView.theme({
        '&': {
          height: 'auto !important',
        },
        '.cm-scroller': {
          overflow: 'visible !important',
        },
        '.cm-editor': {
          height: 'auto !important',
        },
        '.cm-content': {
          padding: '8px',
          minHeight: 'fit-content',
        }
      })
    )

    return exts
  }, [language])

  return (
    <div
      id={id}
      className={`border rounded-lg overflow-hidden ${className}`}
    >
      <CodeMirror
        value={formattedValue}
        extensions={extensions}
        onChange={readOnly ? undefined : (val) => onChange(val)}
        theme="dark"
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          dropCursor: false,
          allowMultipleSelections: false,
          indentOnInput: !readOnly,
          bracketMatching: true,
          closeBrackets: !readOnly,
          autocompletion: !readOnly,
          highlightSelectionMatches: false,
          searchKeymap: !readOnly
        }}
        editable={!readOnly}
      />
    </div>
  )
}