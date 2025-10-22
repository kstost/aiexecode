'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Search, Trash2, Copy, Download, Eye, EyeOff, Filter } from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { JsonValue, PathValue } from '@/types/json'

interface AdvancedJsonEditorProps {
  data: JsonValue
  onChange: (newData: JsonValue) => void
  onSave?: () => void
  className?: string
}

export function AdvancedJsonEditor({ data, onChange, onSave, className }: AdvancedJsonEditorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [showHidden, setShowHidden] = useState(false)
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  // Extract all path-value pairs from nested object
  const extractPaths = useCallback((obj: JsonValue, currentPath: string[] = []): PathValue[] => {
    const paths: PathValue[] = []

    if (obj === null || obj === undefined) {
      return paths
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        const path = [...currentPath, index.toString()]

        paths.push({
          path,
          value: item,
          type: typeof item === 'object' && item !== null ?
            (Array.isArray(item) ? 'array' : 'object') :
            typeof item,
          parentType: 'array'
        })

        if (typeof item === 'object' && item !== null) {
          paths.push(...extractPaths(item, path))
        }
      })
    } else if (typeof obj === 'object') {
      Object.entries(obj).forEach(([key, value]) => {
        const path = [...currentPath, key]

        paths.push({
          path,
          value,
          type: typeof value === 'object' && value !== null ?
            (Array.isArray(value) ? 'array' : 'object') :
            typeof value,
          parentType: 'object'
        })

        if (typeof value === 'object' && value !== null) {
          paths.push(...extractPaths(value, path))
        }
      })
    }

    return paths
  }, [])

  const allPaths = useMemo(() => {
    return data ? extractPaths(data) : []
  }, [data, extractPaths])

  // Auto-expand all paths when data changes
  useEffect(() => {
    if (data && allPaths.length > 0) {
      const allExpandablePaths = new Set<string>()
      allPaths.forEach(pathValue => {
        if (pathValue.type === 'object' || pathValue.type === 'array') {
          allExpandablePaths.add(pathValue.path.join('.'))
        }
      })
      setExpandedPaths(allExpandablePaths)
    }
  }, [data, allPaths])

  // Filter paths based on search and type
  const filteredPaths = allPaths.filter(pathValue => {
    const pathString = pathValue.path.join('.')
    const matchesSearch = searchTerm === '' ||
      pathString.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(pathValue.value).toLowerCase().includes(searchTerm.toLowerCase())

    const matchesType = filterType === 'all' || pathValue.type === filterType

    // Hide nested paths if parent is not expanded
    if (!showHidden) {
      const parentPaths = pathValue.path.slice(0, -1)
      for (let i = 1; i <= parentPaths.length; i++) {
        const parentPath = parentPaths.slice(0, i).join('.')
        if (!expandedPaths.has(parentPath)) {
          return false
        }
      }
    }

    return matchesSearch && matchesType
  })

  const updateValue = (path: string[], newValue: string) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }

    // Convert value to appropriate type
    let convertedValue: JsonValue = newValue
    try {
      // Try to parse as JSON first
      convertedValue = JSON.parse(newValue)
    } catch {
      // If parsing fails, determine type based on content
      if (newValue === 'true' || newValue === 'false') {
        convertedValue = newValue === 'true'
      } else if (!isNaN(Number(newValue)) && newValue !== '') {
        convertedValue = Number(newValue)
      } else if (newValue === 'null') {
        convertedValue = null
      } else {
        convertedValue = newValue
      }
    }

    current[path[path.length - 1]] = convertedValue
    onChange(newData)
  }

  const deleteValue = (path: string[]) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }

    if (Array.isArray(current)) {
      current.splice(parseInt(path[path.length - 1]), 1)
    } else {
      delete current[path[path.length - 1]]
    }

    onChange(newData)
  }

  // Note: addValue function available but not currently used in UI
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addValue = (path: string[], key: string, value: JsonValue) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData

    for (const segment of path) {
      current = current[segment]
    }

    if (Array.isArray(current)) {
      current.push(value)
    } else {
      current[key] = value
    }

    onChange(newData)
  }

  const copyPath = (path: string[]) => {
    navigator.clipboard.writeText(path.join('.'))
    toast.success('경로가 클립보드에 복사되었습니다')
  }

  const copyValue = (value: JsonValue) => {
    navigator.clipboard.writeText(JSON.stringify(value, null, 2))
    toast.success('값이 클립보드에 복사되었습니다')
  }

  const toggleExpand = (pathString: string) => {
    const newExpanded = new Set(expandedPaths)
    if (newExpanded.has(pathString)) {
      newExpanded.delete(pathString)
    } else {
      newExpanded.add(pathString)
    }
    setExpandedPaths(newExpanded)
  }

  const startEdit = (pathString: string, currentValue: JsonValue) => {
    setEditingPath(pathString)
    setEditValue(typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue))
  }

  const saveEdit = (path: string[]) => {
    updateValue(path, editValue)
    setEditingPath(null)
    setEditValue('')
  }

  const cancelEdit = () => {
    setEditingPath(null)
    setEditValue('')
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'string': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
      case 'number': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
      case 'boolean': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
      case 'object': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200'
      case 'array': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200'
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
    }
  }

  const renderValue = (value: JsonValue, type: string) => {
    if (type === 'object' || type === 'array') {
      const length = Array.isArray(value) ? value.length : Object.keys(value || {}).length
      return `${type === 'array' ? '[' : '{'}${length} item${length !== 1 ? 's' : ''}${type === 'array' ? ']' : '}'}`
    }

    if (type === 'string') {
      const str = String(value)
      const truncated = str.length > 100 ? str.substring(0, 100) + '...' : str
      return `"${truncated}"`
    }

    return String(value)
  }

  const uniqueTypes = ['all', ...new Set(allPaths.map(p => p.type))]

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>고급 JSON 편집기</span>
          <div className="flex items-center gap-2">
            {onSave && (
              <Button onClick={onSave} size="sm">
                저장
              </Button>
            )}
          </div>
        </CardTitle>
        <CardDescription>
          복잡한 JSON 구조를 경로별로 편집할 수 있습니다
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filter Controls */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="경로나 값으로 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {uniqueTypes.map(type => (
                <SelectItem key={type} value={type}>
                  {type === 'all' ? '모든 타입' : type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={showHidden ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowHidden(!showHidden)}
          >
            {showHidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </Button>
        </div>

        <Separator />

        {/* Statistics */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>총 {allPaths.length}개 항목</span>
          <span>•</span>
          <span>필터링됨 {filteredPaths.length}개</span>
          <span>•</span>
          <span>확장됨 {expandedPaths.size}개</span>
        </div>

        {/* Path List */}
        <div className="border rounded-lg max-h-[600px] overflow-auto">
          {filteredPaths.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>조건에 맞는 항목이 없습니다</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredPaths.map((pathValue, index) => {
                const pathString = pathValue.path.join('.')
                const isEditing = editingPath === pathString
                const canExpand = pathValue.type === 'object' || pathValue.type === 'array'
                const isExpanded = expandedPaths.has(pathString)

                const depth = pathValue.path.length
                const indentPx = (depth - 1) * 20 // 20px per level

                // Add visual hierarchy with border and background
                const depthStyles = {
                  1: "border-l-2 border-blue-200 dark:border-blue-800",
                  2: "border-l-2 border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-950/10",
                  3: "border-l-2 border-orange-200 dark:border-orange-800 bg-orange-50/20 dark:bg-orange-950/10",
                  4: "border-l-2 border-purple-200 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-950/10"
                }
                const depthClass = depth <= 4 ? depthStyles[depth as keyof typeof depthStyles] : "border-l-2 border-gray-200 dark:border-gray-800 bg-gray-50/20 dark:bg-gray-950/10"

                return (
                  <div key={`${pathString}-${index}`} className={cn("hover:bg-muted/50 group", depthClass)}>
                    <div className="flex items-center gap-2 py-3" style={{ paddingLeft: `${12 + indentPx}px`, paddingRight: '12px' }}>
                      {/* Expand Button */}
                      {canExpand ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 flex-shrink-0"
                          onClick={() => toggleExpand(pathString)}
                        >
                          {isExpanded ? '−' : '+'}
                        </Button>
                      ) : (
                        <div className="w-6 flex-shrink-0" />
                      )}

                      {/* Path */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs font-mono text-muted-foreground">
                            {/* Show only the current key, not the full path for better readability */}
                            {pathValue.path[pathValue.path.length - 1]}
                          </code>
                          <Badge variant="outline" className={cn("text-xs", getTypeColor(pathValue.type))}>
                            {pathValue.type}
                          </Badge>
                          {/* Show full path as tooltip on hover */}
                          <span className="text-xs text-muted-foreground/50 hidden group-hover:inline" title={pathString}>
                            ({pathString})
                          </span>
                        </div>

                        {/* Value */}
                        {isEditing ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="h-8 text-sm"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  saveEdit(pathValue.path)
                                } else if (e.key === 'Escape') {
                                  cancelEdit()
                                }
                              }}
                            />
                            <Button size="sm" className="h-8 px-2" onClick={() => saveEdit(pathValue.path)}>
                              ✓
                            </Button>
                            <Button size="sm" variant="outline" className="h-8 px-2" onClick={cancelEdit}>
                              ✕
                            </Button>
                          </div>
                        ) : (
                          <div className="font-mono text-sm">
                            {renderValue(pathValue.value, pathValue.type)}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      {!isEditing && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => startEdit(pathString, pathValue.value)}
                            title="편집"
                          >
                            <Search className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => copyPath(pathValue.path)}
                            title="경로 복사"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => copyValue(pathValue.value)}
                            title="값 복사"
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteValue(pathValue.path)}
                            title="삭제"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}