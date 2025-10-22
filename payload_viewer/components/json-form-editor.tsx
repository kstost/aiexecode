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
import { Type, Hash, ToggleLeft, List, FileText } from 'lucide-react'

interface JsonFormEditorProps {
  data: JsonValue
  onChange: (data: JsonValue) => void
  className?: string
}

type JsonFieldType = 'string' | 'number' | 'boolean' | 'array' | 'object' | 'null'

interface JsonField {
  key: string
  value: JsonValue
  type: JsonFieldType
  path: string[]
}

function getJsonType(value: JsonValue): JsonFieldType {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'array'
  if (typeof value === 'object') return 'object'
  return typeof value as JsonFieldType
}

function flattenJson(obj: JsonValue, path: string[] = []): JsonField[] {
  const fields: JsonField[] = []

  if (obj === null) {
    return [{ key: path.join('.') || 'root', value: null, type: 'null', path }]
  }

  if (Array.isArray(obj)) {
    obj.forEach((item, index) => {
      const currentPath = [...path, index.toString()]
      fields.push(...flattenJson(item, currentPath))
    })
  } else if (typeof obj === 'object') {
    Object.entries(obj).forEach(([key, value]) => {
      const currentPath = [...path, key]
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        fields.push(...flattenJson(value, currentPath))
      } else {
        fields.push({
          key: currentPath.join('.'),
          value,
          type: getJsonType(value),
          path: currentPath
        })
      }
    })
  } else {
    fields.push({
      key: path.join('.') || 'root',
      value: obj,
      type: getJsonType(obj),
      path
    })
  }

  return fields
}

function setNestedValue(obj: JsonValue, path: string[], value: JsonValue): JsonValue {
  if (path.length === 0) return value

  if (Array.isArray(obj)) {
    const result = [...obj]
    const [key, ...restPath] = path
    const index = parseInt(key)

    if (restPath.length === 0) {
      result[index] = value
    } else {
      result[index] = setNestedValue(result[index] || {}, restPath, value)
    }
    return result
  } else if (typeof obj === 'object' && obj !== null) {
    const result = { ...obj } as Record<string, JsonValue>
    const [key, ...restPath] = path

    if (restPath.length === 0) {
      result[key] = value
    } else {
      result[key] = setNestedValue(result[key] || {}, restPath, value)
    }
    return result
  }

  return value
}


export function JsonFormEditor({ data, onChange, className = '' }: JsonFormEditorProps) {
  const [groupedFields, setGroupedFields] = useState<Record<string, JsonField[]>>({})

  useEffect(() => {
    if (data) {
      const flattened = flattenJson(data)

      // Group fields by their parent path
      const grouped: Record<string, JsonField[]> = {}
      flattened.forEach(field => {
        const parentPath = field.path.slice(0, -1).join('.') || 'root'
        if (!grouped[parentPath]) {
          grouped[parentPath] = []
        }
        grouped[parentPath].push(field)
      })

      setGroupedFields(grouped)
    }
  }, [data])

  const handleFieldChange = (field: JsonField, newValue: JsonValue) => {
    const updatedData = setNestedValue(data, field.path, newValue)
    onChange(updatedData)
  }

  const handleTypeChange = (field: JsonField, newType: JsonFieldType) => {
    let newValue: JsonValue

    switch (newType) {
      case 'string':
        newValue = String(field.value || '')
        break
      case 'number':
        newValue = Number(field.value) || 0
        break
      case 'boolean':
        newValue = Boolean(field.value)
        break
      case 'null':
        newValue = null
        break
      case 'array':
        newValue = Array.isArray(field.value) ? field.value : []
        break
      case 'object':
        newValue = typeof field.value === 'object' && !Array.isArray(field.value)
          ? field.value
          : {}
        break
      default:
        newValue = field.value
    }

    handleFieldChange(field, newValue)
  }

  const renderFieldValue = (field: JsonField) => {
    const fieldId = `field-${field.key}`

    switch (field.type) {
      case 'string':
        return (
          <div className="space-y-2">
            {String(field.value).length > 100 ? (
              <CodeEditor
                id={fieldId}
                value={String(field.value)}
                onChange={(value) => handleFieldChange(field, value)}
                language="text"
              />
            ) : (
              <Input
                id={fieldId}
                type="text"
                value={String(field.value)}
                onChange={(e) => handleFieldChange(field, e.target.value)}
                className="font-mono"
                placeholder="Enter text..."
              />
            )}
          </div>
        )

      case 'number':
        return (
          <Input
            id={fieldId}
            type="number"
            value={Number(field.value)}
            onChange={(e) => handleFieldChange(field, parseFloat(e.target.value) || 0)}
            className="font-mono"
            placeholder="0"
          />
        )

      case 'boolean':
        return (
          <Input
            id={fieldId}
            value={String(field.value)}
            onChange={(e) => {
              const value = e.target.value.toLowerCase()
              if (value === 'true' || value === 'false') {
                handleFieldChange(field, value === 'true')
              } else {
                handleFieldChange(field, e.target.value)
              }
            }}
            className="font-mono"
            placeholder="true or false"
          />
        )

      case 'null':
        return (
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono">null</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleTypeChange(field, 'string')}
            >
              Convert to String
            </Button>
          </div>
        )

      case 'array':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                Array ({Array.isArray(field.value) ? field.value.length : 0} items)
              </Badge>
            </div>
            <CodeEditor
              id={fieldId}
              value={JSON.stringify(field.value, null, 2)}
              onChange={(value) => {
                try {
                  const parsed = JSON.parse(value)
                  if (Array.isArray(parsed)) {
                    handleFieldChange(field, parsed)
                  }
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              language="json"
            />
          </div>
        )

      case 'object':
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="font-mono">
                Object ({typeof field.value === 'object' && field.value ? Object.keys(field.value).length : 0} keys)
              </Badge>
            </div>
            <CodeEditor
              id={fieldId}
              value={JSON.stringify(field.value, null, 2)}
              onChange={(value) => {
                try {
                  const parsed = JSON.parse(value)
                  if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                    handleFieldChange(field, parsed)
                  }
                } catch {
                  // Invalid JSON, don't update
                }
              }}
              language="json"
            />
          </div>
        )

      default:
        return (
          <div className="text-muted-foreground italic">
            Unsupported type: {field.type}
          </div>
        )
    }
  }

  const getTypeIcon = (type: JsonFieldType) => {
    switch (type) {
      case 'string':
        return <Type className="h-4 w-4" />
      case 'number':
        return <Hash className="h-4 w-4" />
      case 'boolean':
        return <ToggleLeft className="h-4 w-4" />
      case 'array':
        return <List className="h-4 w-4" />
      case 'object':
        return <FileText className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const getTypeColor = (type: JsonFieldType) => {
    switch (type) {
      case 'string':
        return 'bg-green-50 text-green-700 dark:bg-green-800 dark:text-green-100'
      case 'number':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-800 dark:text-blue-100'
      case 'boolean':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-800 dark:text-purple-100'
      case 'array':
        return 'bg-orange-50 text-orange-700 dark:bg-orange-800 dark:text-orange-100'
      case 'object':
        return 'bg-red-50 text-red-700 dark:bg-red-800 dark:text-red-100'
      case 'null':
        return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-100'
      default:
        return 'bg-gray-50 text-gray-700 dark:bg-gray-800 dark:text-gray-100'
    }
  }

  if (!data) {
    return (
      <Card className={`h-full ${className}`}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No data to edit</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const sortedGroups = Object.keys(groupedFields).sort()

  return (
    <Card className={`h-full ${className}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          JSON Form Editor
        </CardTitle>
        <CardDescription>
          Edit JSON values using form controls
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 min-h-0">
        <ScrollArea className="h-full">
          <div className="space-y-6">
            {sortedGroups.map(groupPath => (
              <Accordion key={groupPath} type="single" collapsible>
                <AccordionItem value={groupPath} className="border-2 rounded-lg bg-card/50 shadow-sm">
                  <AccordionTrigger className="text-sm font-medium px-4 py-3 bg-muted/30 rounded-t-lg">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs">
                        {groupPath === 'root' ? 'Root Level' : groupPath}
                      </Badge>
                      <span className="text-muted-foreground">
                        ({groupedFields[groupPath].length} fields)
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 pt-2 px-4 pb-4 bg-background/50 rounded-b-lg">
                      {groupedFields[groupPath].map(field => (
                        <div key={field.key} className="space-y-3 border border-muted-foreground/20 rounded-lg p-3 bg-muted/10">
                          <div className="flex items-center justify-between">
                            <Label htmlFor={`field-${field.key}`} className="flex items-center gap-2 font-medium">
                              <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
                                {field.path[field.path.length - 1]}
                              </span>
                              <Badge
                                variant="secondary"
                                className={`text-xs ${getTypeColor(field.type)}`}
                              >
                                {getTypeIcon(field.type)}
                                {field.type}
                              </Badge>
                            </Label>
                            {field.key !== 'root' && field.path.length > 0 && (
                              <Input
                                value={field.type}
                                onChange={(e) => {
                                  const newType = e.target.value as JsonFieldType
                                  if (['string', 'number', 'boolean', 'array', 'object', 'null'].includes(newType)) {
                                    handleTypeChange(field, newType)
                                  }
                                }}
                                className="w-32 h-8 font-mono text-xs"
                                placeholder="string, number, boolean..."
                              />
                            )}
                          </div>

                          {renderFieldValue(field)}

                          <Separator className="my-4" />
                        </div>
                      ))}
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