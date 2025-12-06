'use client'

import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { TokenSelector } from './TokenSelector'

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-16 items-center justify-between px-6">
        <TokenSelector />
        <div className="flex items-center gap-4">
          <WalletMultiButton className="!bg-primary hover:!bg-primary/90" />
        </div>
      </div>
    </header>
  )
}
