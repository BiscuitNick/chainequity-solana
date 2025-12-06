'use client'

import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { useTokens } from '@/hooks/useApi'
import { ChevronDown, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function TokenSelector() {
  const { tokens, selectedToken, setSelectedToken } = useAppStore()
  const { loading, error } = useTokens() // This fetches tokens into the store

  // Auto-select first token if none selected
  useEffect(() => {
    if (!selectedToken && tokens.length > 0) {
      setSelectedToken(tokens[0])
    }
  }, [tokens, selectedToken, setSelectedToken])

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <span>Loading tokens...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <span>Error loading tokens</span>
      </div>
    )
  }

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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
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
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {tokens.map((token) => (
            <DropdownMenuItem
              key={token.tokenId}
              onClick={() => setSelectedToken(token)}
              className="flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-2">
                <span className="font-bold">{token.symbol}</span>
                <span className="text-muted-foreground">{token.name}</span>
              </div>
              {selectedToken?.tokenId === token.tokenId && (
                <Check className="h-4 w-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
