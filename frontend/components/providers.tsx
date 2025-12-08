'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets'
import { clusterApiUrl } from '@solana/web3.js'
import { useMemo, useState, useCallback } from 'react'
import type { Adapter } from '@solana/wallet-adapter-base'

import '@solana/wallet-adapter-react-ui/styles.css'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())

  // Solana network configuration
  // Use localnet for local development, devnet for deployed
  const network = WalletAdapterNetwork.Devnet
  const endpoint = useMemo(() => {
    // Check if we're running locally
    if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
      return 'http://127.0.0.1:8899'
    }
    return clusterApiUrl(network)
  }, [network])

  // Supported wallets - only Solana-native wallets
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  )

  // Handle wallet errors
  const onError = useCallback((error: Error) => {
    // Ignore "User rejected" errors (user cancelled connection)
    if (error.message?.includes('User rejected')) {
      console.log('User cancelled wallet connection')
      return
    }
    console.error('Wallet error:', error.name, error.message)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider
          wallets={wallets}
          autoConnect
          onError={onError}
        >
          <WalletModalProvider>
            {children}
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </QueryClientProvider>
  )
}
