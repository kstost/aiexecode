"use client"

import * as React from "react"
import { ChevronDown, ChevronRight, Edit2, Plus, Trash2, Copy } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { JsonValue, JsonType, TreeNode } from "@/types/json"

// conso
interface TreeViewProps {
  data: JsonValue
  onChange: (newData: JsonValue) => void
  className?: string
  expandedNodes?: Set<string>
  onExpandedNodesChange?: (expandedNodes: Set<string>) => void
  expandAllByDefault?: boolean
}

export function TreeView({ data, onChange, className, expandedNodes: externalExpandedNodes, onExpandedNodesChange, expandAllByDefault = false }: TreeViewProps) {
  const [internalExpandedNodes, setInternalExpandedNodes] = React.useState<Set<string>>(new Set())
  const [editingNode, setEditingNode] = React.useState<string | null>(null)

  // Use external expandedNodes if provided, otherwise use internal state
  const expandedNodes = externalExpandedNodes || internalExpandedNodes
  const setExpandedNodes = onExpandedNodesChange || setInternalExpandedNodes
  const [editValue, setEditValue] = React.useState('')

  const buildTree = React.useCallback((obj: JsonValue, path: string[] = []): TreeNode[] => {
    if (obj === null || obj === undefined) {
      return []
    }

    return Object.entries(obj).map(([key, value]) => {
      const currentPath = [...path, key]

      let type: JsonType = 'string'
      let children: TreeNode[] = []

      if (value === null) {
        type = 'null'
      } else if (Array.isArray(value)) {
        type = 'array'
        children = value.map((item, index) => {
          const itemPath = [...currentPath, index.toString()]
          return {
            key: index.toString(),
            value: item,
            type: typeof item === 'object' && item !== null ?
              (Array.isArray(item) ? 'array' : 'object') :
              typeof item as TreeNode['type'],
            path: itemPath,
            children: typeof item === 'object' && item !== null ? buildTree(item, itemPath) : undefined
          }
        })
      } else if (typeof value === 'object') {
        type = 'object'
        children = buildTree(value, currentPath)
      } else {
        type = typeof value as TreeNode['type']
      }

      return {
        key,
        value,
        type,
        path: currentPath,
        children: children.length > 0 ? children : undefined
      }
    })
  }, [])

  const tree = React.useMemo(() => buildTree(data), [data, buildTree])

  // Auto-expand all nodes when expandAllByDefault is true
  React.useEffect(() => {
    if (expandAllByDefault && data && tree.length > 0) {
      const allPaths = new Set<string>()
      const collectPaths = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.children && node.children.length > 0) {
            allPaths.add(node.path.join('.'))
            collectPaths(node.children)
          }
        })
      }
      collectPaths(tree)
      setExpandedNodes(allPaths)
    }
  }, [expandAllByDefault, data, tree, setExpandedNodes])

  const toggleNode = (path: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(path)) {
      newExpanded.delete(path)
    } else {
      newExpanded.add(path)
    }
    setExpandedNodes(newExpanded)
  }

  const updateValue = (path: string[], newValue: string) => {
    const newData = JSON.parse(JSON.stringify(data))
    let current = newData

    for (let i = 0; i < path.length - 1; i++) {
      current = current[path[i]]
    }

    // Try to parse as JSON first
    let convertedValue: JsonValue = newValue
    try {
      convertedValue = JSON.parse(newValue)
    } catch {
      // If JSON parse fails, treat as string
      convertedValue = newValue
    }

    current[path[path.length - 1]] = convertedValue
    onChange(newData)
  }

  const deleteNode = (path: string[]) => {
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

  const addNode = (path: string[], key: string, value: JsonValue) => {
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

  const startEdit = (pathString: string, currentValue: JsonValue) => {
    setEditingNode(pathString)
    setEditValue(typeof currentValue === 'string' ? currentValue : JSON.stringify(currentValue))
  }

  const saveEdit = (path: string[]) => {
    try {
      updateValue(path, editValue)
      setEditingNode(null)
      setEditValue('')
    } catch (error) {
      console.log('Failed to save edit:', error)
    }
  }

  const cancelEdit = () => {
    setEditingNode(null)
    setEditValue('')
  }

  const copyPath = (path: string[]) => {
    navigator.clipboard.writeText(path.join('.'))
  }

  const renderValue = (value: JsonValue, type: JsonType) => {
    if (type === 'string') {
      return `"${value}"`
    } else if (type === 'null') {
      return 'null'
    } else if (type === 'object' || type === 'array') {
      const length = Array.isArray(value) ? value.length : Object.keys(value || {}).length
      return `${type === 'array' ? '[' : '{'}${length} item${length !== 1 ? 's' : ''}${type === 'array' ? ']' : '}'}`
    }
    return String(value)
  }

  const getTypeColor = (type: JsonType) => {
    switch (type) {
      case 'string': return 'text-green-600 dark:text-green-400'
      case 'number': return 'text-blue-600 dark:text-blue-400'
      case 'boolean': return 'text-purple-600 dark:text-purple-400'
      case 'null': return 'text-gray-500 dark:text-gray-400'
      case 'object': return 'text-orange-600 dark:text-orange-400'
      case 'array': return 'text-indigo-600 dark:text-indigo-400'
      default: return 'text-gray-600 dark:text-gray-300'
    }
  }

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const pathString = node.path.join('.')
    const isExpanded = expandedNodes.has(pathString)
    const isEditing = editingNode === pathString
    const hasChildren = node.children && node.children.length > 0

    return (
      <div key={pathString} className="select-none">
        <div
          className={cn(
            "flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group",
            "min-h-[32px]"
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-4 w-4 p-0"
              onClick={() => toggleNode(pathString)}
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </Button>
          ) : (
            <div className="w-4" />
          )}

          {/* Key */}
          <span className="font-medium text-sm min-w-0 flex-shrink-0">
            {node.key}:
          </span>

          {/* Value */}
          {isEditing ? (
            <div className="flex items-center gap-2 flex-1">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="h-6 text-xs"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveEdit(node.path)
                  } else if (e.key === 'Escape') {
                    cancelEdit()
                  }
                }}
              />
              <Button size="sm" className="h-6 px-2" onClick={() => saveEdit(node.path)}>
                ✓
              </Button>
              <Button size="sm" variant="outline" className="h-6 px-2" onClick={cancelEdit}>
                ✕
              </Button>
            </div>
          ) : (
            <>
              <span className={cn("text-sm font-mono flex-1", getTypeColor(node.type))}>
                {renderValue(node.value, node.type)}
              </span>

              {/* Action Buttons */}
              <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => startEdit(pathString, node.value)}
                  title="Edit"
                >
                  <Edit2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => copyPath(node.path)}
                  title="Copy path"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                {(node.type === 'object' || node.type === 'array') && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => {
                      const newKey = node.type === 'array' ? 'new_item' : 'new_key'
                      addNode(node.path, newKey, node.type === 'array' ? '' : '')
                    }}
                    title="Add item"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteNode(node.path)}
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </>
          )}
        </div>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div>
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn("border rounded-lg overflow-hidden flex flex-col h-full", className)}>
      <div className="bg-muted/30 px-3 py-2 border-b flex-shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">JSON Tree Editor</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpandedNodes(new Set())}
            >
              Collapse All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const allPaths = new Set<string>()
                const collectPaths = (nodes: TreeNode[]) => {
                  nodes.forEach(node => {
                    if (node.children && node.children.length > 0) {
                      allPaths.add(node.path.join('.'))
                      collectPaths(node.children)
                    }
                  })
                }
                collectPaths(tree)
                setExpandedNodes(allPaths)
              }}
            >
              Expand All
            </Button>
          </div>
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-auto p-2 pb-8">
        {tree.map((node) => renderNode(node))}
      </div>
    </div>
  )
}