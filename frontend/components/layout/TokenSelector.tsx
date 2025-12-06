'use client'

import { useAppStore } from '@/stores/useAppStore'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function TokenSelector() {
  const { tokens, selectedToken, setSelectedToken } = useAppStore()

  if (tokens.length === 0) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>No tokens available</span>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground">Token:</span>
      <Button variant="outline" className="gap-2">
        {selectedToken ? (
          <>
            <span className="font-bold">{selectedToken.symbol}</span>
            <span className="text-muted-foreground">{selectedToken.name}</span>
          </>
        ) : (
          <span>Select Token</span>
        )}
        <ChevronDown className="h-4 w-4" />
      </Button>
    </div>
  )
}
