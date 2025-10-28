'use client'

import React, { useState, useRef, useEffect } from 'react'
import dynamic from 'next/dynamic'
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

interface MonacoTextareaProps {
  value: string
  onChange: (value: string) => void
  language?: string
  placeholder?: string
  minHeight?: number
  maxHeight?: number
  className?: string
  id?: string
}

export function MonacoTextarea({
  value,
  onChange,
  language = 'json',
  placeholder = '',
  minHeight = 100,
  maxHeight,
  className = '',
  id
}: MonacoTextareaProps) {
  // Monaco Editor refs and state - exactly like request-editor
  const editorContainerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<ExtendedEditor | null>(null)
  const [editorHeight, setEditorHeight] = useState(minHeight)

  // Monaco Editor height management - exactly like request-editor but with limits
  const updateEditorHeight = React.useCallback((contentHeight: number) => {
    // Add padding to prevent scrollbar due to height calculation precision issues
    const EXTRA_PADDING = 10
    let newHeight = Math.max(contentHeight + EXTRA_PADDING, minHeight)

    // Apply maxHeight limit if specified
    if (maxHeight && newHeight > maxHeight) {
      newHeight = maxHeight
    }

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
  }, [editorHeight, minHeight, maxHeight])

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

    // Disable wheel events on Monaco Editor DOM element - exactly like request-editor
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

  // Handle wheel events on editor container to propagate to parent - exactly like request-editor
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

  // Cleanup function for Monaco Editor - exactly like request-editor
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

  // Reset editor height when value changes significantly
  useEffect(() => {
    if (editorRef.current && value !== undefined) {
      // Reset editor height when loading new content
      setEditorHeight(minHeight)
      if (editorContainerRef.current) {
        editorContainerRef.current.style.height = `${minHeight}px`
      }

      setTimeout(() => {
        if (editorRef.current) {
          const contentHeight = editorRef.current.getContentHeight()
          updateEditorHeight(contentHeight)
        }
      }, 10)
    }
  }, [value, updateEditorHeight, minHeight])

  const handleCodeChange = (newValue: string | undefined) => {
    const content = newValue || ''
    onChange(content)
  }

  // Determine scrollbar settings based on current height
  const showScrollbar = maxHeight && editorHeight >= maxHeight

  return (
    <div
      id={id}
      ref={editorContainerRef}
      className={`border rounded-lg overflow-hidden ${className}`}
      style={{ height: `${editorHeight}px` }}
      onWheel={handleContainerWheel}
    >
      <MonacoEditor
        height="100%"
        defaultLanguage={language}
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
          automaticLayout: false,
          scrollbar: {
            vertical: showScrollbar ? 'auto' : 'hidden',
            verticalScrollbarSize: showScrollbar ? 10 : 0,
            horizontal: 'auto',
            horizontalScrollbarSize: 10
          },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          mouseWheelScrollSensitivity: showScrollbar ? 1 : 0,
          placeholder: placeholder
        }}
      />
    </div>
  )
}