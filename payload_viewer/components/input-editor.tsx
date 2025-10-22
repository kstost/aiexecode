'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CodeEditor } from '@/components/ui/code-editor'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { ScrollArea } from '@/components/ui/scroll-area'
import { JsonValue } from '@/types/json'
import { Plus, Minus, MessageSquare, User, Bot, Settings, Hash, FileText } from 'lucide-react'

interface InputEditorProps {
  data: JsonValue
  onChange: (data: JsonValue) => void
  className?: string
}

type Message = {
  role: string
  content: MessageContent[]
} & Record<string, JsonValue>

type MessageContent = {
  type: string
  text?: string
} & Record<string, JsonValue>

function isInputArray(data: JsonValue): data is Message[] {
  return Array.isArray(data) && data.length > 0 &&
    typeof data[0] === 'object' && data[0] !== null &&
    (('role' in data[0] && 'content' in data[0]) ||
     ('type' in data[0] && (data[0].type === 'function_call' || data[0].type === 'function_call_output' || data[0].type === 'reasoning')))
}

function getMessageTypeIcon(message: Message) {
  switch (message.role) {
    case 'system':
      return <Settings className="h-4 w-4" />
    case 'user':
      return <User className="h-4 w-4" />
    case 'assistant':
      return <Bot className="h-4 w-4" />
    default:
      if (message.type === 'reasoning') return <Hash className="h-4 w-4" />
      if (message.type === 'function_call') return <Settings className="h-4 w-4" />
      if (message.type === 'function_call_output') return <FileText className="h-4 w-4" />
      return <MessageSquare className="h-4 w-4" />
  }
}

function getMessageTypeColor(message: Message) {
  switch (message.role) {
    case 'system':
      return 'bg-purple-50 text-purple-700 dark:bg-purple-800 dark:text-purple-100'
    case 'user':
      return 'bg-blue-50 text-blue-700 dark:bg-blue-800 dark:text-blue-100'
    case 'assistant':
      return 'bg-green-50 text-green-700 dark:bg-green-800 dark:text-green-100'
    default:
      if (message.type === 'reasoning') return 'bg-orange-50 text-orange-700 dark:bg-orange-800 dark:text-orange-100'
      if (message.type === 'function_call') return 'bg-red-50 text-red-700 dark:bg-red-800 dark:text-red-100'
      if (message.type === 'function_call_output') return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-100'
      return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-100'
  }
}

export function InputEditor({ data, onChange, className = '' }: InputEditorProps) {
  const [messages, setMessages] = useState<Message[]>([])

  // Helper function to check if message is readonly
  const isReadOnlyMessage = (message: Message) => {
    return message.type === 'function_call' || message.type === 'reasoning' || message.type === 'function_call_output'
  }

  useEffect(() => {
    if (isInputArray(data)) {
      // Only process content if it exists in the original message
      const processedMessages = data.map(message => {
        // If message already has content property, ensure it's an array
        if ('content' in message) {
          return {
            ...message,
            content: Array.isArray(message.content) ? message.content : []
          }
        }
        // Otherwise, keep the message as-is without adding content
        return message
      })
      setMessages(processedMessages)
    } else {
      setMessages([])
    }
  }, [data])


  const addMessage = () => {
    const newMessage: Message = {
      role: 'user',
      content: [{ type: 'input_text', text: '' }]
    }
    const newMessages = [...messages, newMessage]
    setMessages(newMessages)
    onChange(newMessages)
  }

  const removeMessage = (index: number) => {
    const newMessages = messages.filter((_, i) => i !== index)
    setMessages(newMessages)
    onChange(newMessages)
  }

  const addContentToMessage = (messageIndex: number) => {
    const newMessages = [...messages]
    if (!Array.isArray(newMessages[messageIndex].content)) {
      newMessages[messageIndex].content = []
    }
    newMessages[messageIndex].content.push({ type: 'input_text', text: '' })
    setMessages(newMessages)
    onChange(newMessages)
  }

  const removeContentFromMessage = (messageIndex: number, contentIndex: number) => {
    const newMessages = [...messages]
    if (Array.isArray(newMessages[messageIndex].content)) {
      newMessages[messageIndex].content = newMessages[messageIndex].content.filter((_, i) => i !== contentIndex)
    }
    setMessages(newMessages)
    onChange(newMessages)
  }

  const updateMessageContent = (messageIndex: number, contentIndex: number, field: string, value: string) => {
    const newMessages = [...messages]
    if (!Array.isArray(newMessages[messageIndex].content)) {
      newMessages[messageIndex].content = []
    }
    const content = newMessages[messageIndex].content[contentIndex]
    if (content) {
      if (field === 'type') {
        content.type = value
      } else if (field === 'text') {
        content.text = value
      }
    }
    setMessages(newMessages)
    onChange(newMessages)
  }

  const updateMessageField = (index: number, field: string, value: JsonValue) => {
    const newMessages = [...messages]
    newMessages[index][field] = value
    setMessages(newMessages)
    onChange(newMessages)
  }

  if (!isInputArray(data)) {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Input 배열 형식이 아닙니다</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`h-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Input 메시지 편집기
          </div>
          <Button size="sm" onClick={addMessage}>
            <Plus className="h-4 w-4 mr-2" />
            메시지 추가
          </Button>
        </CardTitle>
        <CardDescription>
          대화 메시지와 함수 호출을 편집합니다 ({messages.length}개 메시지)
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="space-y-6">
            {messages.map((message, messageIndex) => (
              <Accordion key={messageIndex} type="single" collapsible defaultValue={message.role === 'system' ? undefined : `message-${messageIndex}`}>
                <AccordionItem value={`message-${messageIndex}`} className="border-2 rounded-lg bg-card/50 shadow-sm">
                  <AccordionTrigger className="text-sm font-medium hover:no-underline px-4 py-3 bg-muted/30 rounded-t-lg">
                    <div className="flex items-center gap-2 w-full">
                      <Badge
                        variant="secondary"
                        className={`text-xs ${getMessageTypeColor(message)}`}
                      >
                        {getMessageTypeIcon(message)}
{String(message.role || message.type || 'Unknown')}
                      </Badge>
                      <span className="text-muted-foreground text-xs flex-1 text-left">
                        {message.role === 'system' || message.role === 'user' || message.role === 'assistant'
                          ? `${Array.isArray(message.content) ? message.content.length : 0} content items`
                          : message.type === 'function_call_output'
                          ? String(message.call_id || 'Function Call Output')
                          : String(message.name || message.id || `Message ${messageIndex + 1}`)}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeMessage(messageIndex)
                        }}
                        className="h-6 w-6 p-0"
                        disabled={isReadOnlyMessage(message)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2 px-4 pb-4 bg-background/50 rounded-b-lg">
                      {/* Message Fields */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Role - only show if role property exists */}
                        {message.role !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor={`role-${messageIndex}`}>Role</Label>
                            <Input
                              id={`role-${messageIndex}`}
                              value={String(message.role || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'role', e.target.value)}
                              className="font-mono text-xs"
                              placeholder="system, user, assistant"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* ID */}
                        {message.id !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor={`id-${messageIndex}`}>ID</Label>
                            <Input
                              id={`id-${messageIndex}`}
value={String(message.id || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'id', e.target.value)}
                              className="font-mono text-xs"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Type - only show if type property exists */}
                        {message.type !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor={`type-${messageIndex}`}>Type</Label>
                            <Input
                              id={`type-${messageIndex}`}
                              value={String(message.type || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'type', e.target.value)}
                              className="font-mono text-xs"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Status */}
                        {message.status !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor={`status-${messageIndex}`}>Status</Label>
                            <Input
                              id={`status-${messageIndex}`}
                              value={String(message.status || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'status', e.target.value)}
                              className="font-mono text-xs"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Arguments */}
                        {message.arguments !== undefined && (
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor={`args-${messageIndex}`}>Arguments</Label>
                            <CodeEditor
                              id={`args-${messageIndex}`}
                              value={String(message.arguments || '')}
                              onChange={(value) => updateMessageField(messageIndex, 'arguments', value)}
                              language="json"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Call ID - only show for non-function_call_output messages */}
                        {message.call_id !== undefined && message.type !== 'function_call_output' && (
                          <div className="space-y-2">
                            <Label htmlFor={`call_id-${messageIndex}`}>Call ID</Label>
                            <Input
                              id={`call_id-${messageIndex}`}
                              value={String(message.call_id || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'call_id', e.target.value)}
                              className="font-mono text-xs"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Name */}
                        {message.name !== undefined && (
                          <div className="space-y-2">
                            <Label htmlFor={`name-${messageIndex}`}>Name</Label>
                            <Input
                              id={`name-${messageIndex}`}
                              value={String(message.name || '')}
                              onChange={(e) => updateMessageField(messageIndex, 'name', e.target.value)}
                              className="font-mono text-xs"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}

                        {/* Output */}
                        {message.output !== undefined && (
                          <div className="space-y-2 col-span-2">
                            <Label htmlFor={`output-${messageIndex}`}>Output</Label>
                            <CodeEditor
                              id={`output-${messageIndex}`}
                              value={String(message.output || '')}
                              onChange={(value) => updateMessageField(messageIndex, 'output', value)}
                              language="json"
                              readOnly={isReadOnlyMessage(message)}
                            />
                          </div>
                        )}
                      </div>

                      <Separator />

                      {/* Content Array - only show for role-based messages */}
                      {message.role && (message.role === 'system' || message.role === 'user' || message.role === 'assistant') && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label>Content ({Array.isArray(message.content) ? message.content.length : 0} items)</Label>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => addContentToMessage(messageIndex)}
                              disabled={isReadOnlyMessage(message)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Content
                            </Button>
                          </div>

                          {Array.isArray(message.content) ? message.content.map((content, contentIndex) => (
                          <div key={contentIndex} className="border-2 border-dashed border-muted-foreground/30 rounded-lg p-4 space-y-3 bg-muted/20">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs font-medium bg-primary/10 text-primary border-primary/20">
                                  Content {contentIndex + 1}
                                </Badge>
                                <Input
                                  value={String(content.type || '')}
                                  onChange={(e) => updateMessageContent(messageIndex, contentIndex, 'type', e.target.value)}
                                  className="w-40 h-8 font-mono text-xs"
                                  placeholder="input_text, text, image"
                                  readOnly={isReadOnlyMessage(message)}
                                />
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeContentFromMessage(messageIndex, contentIndex)}
                                className="h-6 w-6 p-0"
                                disabled={isReadOnlyMessage(message)}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                            </div>

                            {content.text !== undefined && (
                              <div className="space-y-2">
                                <Label>Text Content</Label>
                                {(content.text || '').length > 100 ? (
                                  <CodeEditor
                                    value={String(content.text || '')}
                                    onChange={(value) => updateMessageContent(messageIndex, contentIndex, 'text', value)}
                                    language="text"
                                    readOnly={isReadOnlyMessage(message)}
                                  />
                                ) : (
                                  <Input
                                    value={String(content.text || '')}
                                    onChange={(e) => updateMessageContent(messageIndex, contentIndex, 'text', e.target.value)}
                                    placeholder="Enter text content..."
                                    readOnly={isReadOnlyMessage(message)}
                                  />
                                )}
                              </div>
                            )}
                          </div>
                          )) : null}
                        </div>
                      )}

                      {/* Summary for reasoning type */}
                      {message.summary !== undefined && (
                        <div className="space-y-2">
                          <Label>Summary</Label>
                          <CodeEditor
                            value={JSON.stringify(message.summary, null, 2)}
                            onChange={(value) => {
                              try {
                                const parsed = JSON.parse(value)
                                const newMessages = [...messages]
                                newMessages[messageIndex].summary = parsed
                                setMessages(newMessages)
                                onChange(newMessages)
                              } catch {
                                // Invalid JSON, don't update
                              }
                            }}
                            language="json"
                            readOnly={isReadOnlyMessage(message)}
                          />
                        </div>
                      )}

                      <Separator className="my-4" />
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}