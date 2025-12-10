'use client'

import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { api, AllowlistEntry } from '@/lib/api'

interface ApprovedWalletSelectorProps {
  tokenId: number
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  /** Optional pre-fetched allowlist to avoid duplicate API calls */
  allowlist?: AllowlistEntry[]
}

export function ApprovedWalletSelector({
  tokenId,
  value,
  onChange,
  placeholder = 'Select an approved wallet',
  disabled = false,
  className = '',
  allowlist: externalAllowlist,
}: ApprovedWalletSelectorProps) {
  const [internalAllowlist, setInternalAllowlist] = useState<AllowlistEntry[]>([])
  const [loading, setLoading] = useState(false)

  // Use external allowlist if provided, otherwise fetch internally
  const allowlist = externalAllowlist ?? internalAllowlist

  useEffect(() => {
    // Only fetch if no external allowlist is provided
    if (!externalAllowlist && tokenId) {
      fetchAllowlist()
    }
  }, [tokenId, externalAllowlist])

  const fetchAllowlist = async () => {
    setLoading(true)
    try {
      const data = await api.getAllowlist(tokenId, 0, 100)
      setInternalAllowlist(data.filter(entry => entry.status === 'active'))
    } catch (e) {
      console.error('Failed to fetch allowlist:', e)
      setInternalAllowlist([])
    } finally {
      setLoading(false)
    }
  }

  const activeWallets = allowlist.filter(entry => entry.status === 'active')

  // If no approved wallets, show a simple input
  if (activeWallets.length === 0 && !loading) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Solana wallet address"
        disabled={disabled}
        className={className}
      />
    )
  }

  return (
    <Select
      value={value}
      onValueChange={onChange}
      disabled={disabled || loading}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={loading ? 'Loading wallets...' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {activeWallets.map((entry) => (
          <SelectItem key={entry.address} value={entry.address}>
            {entry.address.slice(0, 4)}...{entry.address.slice(-4)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
