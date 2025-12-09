'use client'

import dynamic from 'next/dynamic'
import { TokenSelector } from './TokenSelector'
import { SlotSelector } from './SlotSelector'

// Dynamically import WalletMultiButton to avoid hydration mismatch
// (it renders differently on server vs client due to wallet detection)
const WalletMultiButton = dynamic(
  () => import('@solana/wallet-adapter-react-ui').then(mod => mod.WalletMultiButton),
  { ssr: false }
)

export function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background">
      <div className="flex h-16 items-center justify-between px-6">
        <div className="flex items-center gap-6">
          <TokenSelector />
          <SlotSelector />
        </div>
        <div className="flex items-center gap-4">
          <WalletMultiButton className="!bg-primary hover:!bg-primary/90" />
        </div>
      </div>
    </header>
  )
}
