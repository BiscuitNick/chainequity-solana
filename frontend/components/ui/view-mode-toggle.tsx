'use client'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Table2, PieChart, BarChart3, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ViewMode = 'table' | 'pie' | 'bar'

interface ViewModeOption {
  mode: ViewMode
  icon: LucideIcon
  label: string
}

const defaultOptions: ViewModeOption[] = [
  { mode: 'table', icon: Table2, label: 'Table view' },
  { mode: 'pie', icon: PieChart, label: 'Pie chart' },
  { mode: 'bar', icon: BarChart3, label: 'Bar chart' },
]

interface ViewModeToggleProps {
  value: ViewMode
  onChange: (mode: ViewMode) => void
  options?: ViewModeOption[]
  className?: string
}

export function ViewModeToggle({
  value,
  onChange,
  options = defaultOptions,
  className,
}: ViewModeToggleProps) {
  return (
    <TooltipProvider>
      <div className={cn('flex items-center gap-0.5 bg-muted rounded-md p-1', className)}>
        {options.map((option) => {
          const Icon = option.icon
          const isActive = value === option.mode

          return (
            <Tooltip key={option.mode}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  size="sm"
                  className={cn(
                    'h-7 w-7 p-0',
                    isActive && 'bg-background shadow-sm'
                  )}
                  onClick={() => onChange(option.mode)}
                  aria-label={option.label}
                  aria-pressed={isActive}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={5}>
                <p>{option.label}</p>
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>
    </TooltipProvider>
  )
}
