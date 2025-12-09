"use client"

import * as React from "react"

interface TooltipProviderProps {
  children: React.ReactNode
  delayDuration?: number
}

export function TooltipProvider({ children }: TooltipProviderProps) {
  return <>{children}</>
}

interface TooltipProps {
  children: React.ReactNode
}

export function Tooltip({ children }: TooltipProps) {
  return <div className="relative inline-flex">{children}</div>
}

interface TooltipTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

export const TooltipTrigger = React.forwardRef<HTMLDivElement, TooltipTriggerProps>(
  ({ children, asChild }, ref) => {
    return (
      <div ref={ref} className="peer">
        {children}
      </div>
    )
  }
)
TooltipTrigger.displayName = "TooltipTrigger"

interface TooltipContentProps {
  children: React.ReactNode
  side?: "top" | "right" | "bottom" | "left"
  sideOffset?: number
}

export function TooltipContent({ children, side = "top" }: TooltipContentProps) {
  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1",
    left: "right-full top-1/2 -translate-y-1/2 mr-1",
    right: "left-full top-1/2 -translate-y-1/2 ml-1",
  }

  return (
    <div
      className={`
        absolute ${positionClasses[side]} z-50
        hidden peer-hover:block
        px-2 py-1 text-xs
        bg-popover text-popover-foreground
        border rounded shadow-md
        whitespace-nowrap
        animate-in fade-in-0 zoom-in-95
      `}
    >
      {children}
    </div>
  )
}
