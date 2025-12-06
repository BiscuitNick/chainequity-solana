'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Coins, ExternalLink, RefreshCw } from 'lucide-react'
import { CreateTokenModal } from '@/components/CreateTokenModal'

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

export default function TokensPage() {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTokens = async () => {
    setLoading(true)
    setError(null)

    try {
      // First try to fetch from the backend API
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'
      console.log('Fetching from:', `${apiUrl}/factory/tokens`)
      const response = await fetch(`${apiUrl}/factory/tokens`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        const data = await response.json()
        // API worked - use the data (even if empty)
        setTokens(data.map((t: any) => ({
          id: t.token_id,
          symbol: t.symbol,
          name: t.name,
          mintAddress: t.mint_address,
          totalSupply: parseInt(t.total_supply) / Math.pow(10, t.decimals || 6),
          decimals: t.decimals || 6,
          holders: 0, // Would need separate query
          isPaused: t.is_paused,
          createdAt: t.created_at,
        })))
        setLoading(false)
        return
      }

      // API failed - show empty state (don't try on-chain fallback which may fail)
      console.warn('API returned non-ok status:', response.status)
      setTokens([])
    } catch (e: any) {
      console.error('Failed to fetch tokens:', e)
      setError(e.message || 'Failed to fetch tokens')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTokens()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tokens</h1>
          <p className="text-muted-foreground">
            Manage your tokenized securities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTokens} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Token
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-red-500/50 bg-red-500/10">
          <CardContent className="pt-4">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : tokens.length}</div>
            <p className="text-xs text-muted-foreground">created</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Supply</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : tokens.reduce((sum, t) => sum + t.totalSupply, 0).toLocaleString()}
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
              {loading ? '...' : tokens.reduce((sum, t) => sum + t.holders, 0)}
            </div>
            <p className="text-xs text-muted-foreground">unique wallets</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : tokens.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No tokens found</h3>
            <p className="text-muted-foreground mb-4">
              Create your first security token to get started.
            </p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Token
            </Button>
          </CardContent>
        </Card>
      ) : (
      <div className="grid gap-4 md:grid-cols-2">
        {tokens.map((token) => (
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
      )}

      {/* Create Token Modal */}
      <CreateTokenModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false)
          fetchTokens()
        }}
      />
    </div>
  )
}
