'use client'

import { Button } from '@/components/ui/button'
import { Wallet } from 'lucide-react'

interface UseWalletButtonProps {
  publicKey: string | null
  currentValue: string
  onUseWallet: () => void
  disabled?: boolean
}

export function UseWalletButton({ publicKey, currentValue, onUseWallet, disabled = false }: UseWalletButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onUseWallet}
      disabled={!publicKey || currentValue !== '' || disabled}
    >
      <Wallet className="h-4 w-4 mr-2" />
      Use My Wallet
    </Button>
  )
}
