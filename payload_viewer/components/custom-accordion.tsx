'use client'

import React from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface CustomAccordionProps {
  items: Array<{
    id: string
    title: React.ReactNode
    content: React.ReactNode
  }>
  expandedIds: Set<string>
  onToggle: (id: string) => void
  className?: string
}

export function CustomAccordion({ items, expandedIds, onToggle, className = '' }: CustomAccordionProps) {
  console.log('CustomAccordion render:', {
    expandedIds: Array.from(expandedIds),
    itemCount: items.length
  })

  return (
    <div className={`space-y-2 ${className}`}>
      {items.map((item) => {
        const isExpanded = expandedIds.has(item.id)

        return (
          <div key={item.id} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => {
                console.log('CustomAccordion toggle clicked:', { id: item.id, isExpanded })
                onToggle(item.id)
              }}
              className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-muted transition-colors"
              type="button"
            >
              <div className="flex-1">{item.title}</div>
              {isExpanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
            </button>

            {isExpanded && (
              <div className="px-4 py-3 border-t bg-muted/30">
                {item.content}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}