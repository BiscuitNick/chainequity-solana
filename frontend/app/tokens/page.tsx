'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Coins, ExternalLink } from 'lucide-react'

interface TokenInfo {
  id: number
  symbol: string
  name: string
  mintAddress: string
  totalSupply: number
  decimals: number
  holders: number
  isPaused: boolean
  createdAt: string
}

// Mock data
const mockTokens: TokenInfo[] = [
  {
    id: 1,
    symbol: 'ACME',
    name: 'Acme Corp Equity',
    mintAddress: 'Hk4M...8xYq',
    totalSupply: 1000000,
    decimals: 0,
    holders: 120,
    isPaused: false,
    createdAt: '2024-01-01',
  },
  {
    id: 2,
    symbol: 'BETA',
    name: 'Beta Industries',
    mintAddress: 'Jm2N...9zWr',
    totalSupply: 500000,
    decimals: 0,
    holders: 45,
    isPaused: false,
    createdAt: '2024-01-10',
  },
]

export default function TokensPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
          <p className="text-muted-foreground">
            Manage your tokenized securities
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Token
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockTokens.length}</div>
            <p className="text-xs text-muted-foreground">created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Supply</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockTokens.reduce((sum, t) => sum + t.totalSupply, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">combined shares</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Holders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockTokens.reduce((sum, t) => sum + t.holders, 0)}
            </div>
            <p className="text-xs text-muted-foreground">unique wallets</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {mockTokens.map((token) => (
          <Card key={token.id} className="hover:border-primary/50 transition-colors cursor-pointer">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                    <Coins className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{token.symbol}</CardTitle>
                    <CardDescription>{token.name}</CardDescription>
                  </div>
                </div>
                {token.isPaused && (
                  <span className="px-2 py-1 bg-red-500/10 text-red-500 rounded text-xs">
                    Paused
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Total Supply</p>
                  <p className="font-medium">{token.totalSupply.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Holders</p>
                  <p className="font-medium">{token.holders}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Created</p>
                  <p className="font-medium">{token.createdAt}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <span className="font-mono text-xs text-muted-foreground">{token.mintAddress}</span>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
