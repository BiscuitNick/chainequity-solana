'use client'

import { useState } from 'react'
import { Copy, Check } from 'lucide-react'

interface WalletAddressProps {
  address: string
  className?: string
}

export function WalletAddress({ address, className = '' }: WalletAddressProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Format: show first 8 and last 4 characters
  const truncated = address.length > 12
    ? `${address.slice(0, 8)}...${address.slice(-4)}`
    : address

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      <span className="font-mono text-sm">{truncated}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          copyToClipboard()
        }}
        className="p-1 hover:bg-muted rounded transition-colors"
        title="Copy wallet address"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
    </span>
  )
}
