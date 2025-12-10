'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Plus, Coins, ExternalLink, RefreshCw, Calendar, Vote, DollarSign, Shield, Lock, Settings } from 'lucide-react'
import { CreateTokenModal } from '@/components/CreateTokenModal'

interface TokenFeatures {
  vesting_enabled?: boolean
  governance_enabled?: boolean
  dividends_enabled?: boolean
  transfer_restrictions_enabled?: boolean
  upgradeable?: boolean
  admin_signers?: string[]
  admin_threshold?: number
}

interface TokenInfo {
  id: number
  symbol: string
  name: string
  mintAddress: string
  issuedSupply: number
  decimals: number
  holders: number
  isPaused: boolean
  createdAt: string
  features?: TokenFeatures
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

        // Get current slot for state reconstruction
        const baseUrl = apiUrl.replace('/api/v1', '')
        let currentSlot = 999999 // fallback to large slot number
        try {
          const slotRes = await fetch(`${baseUrl}/slot`)
          if (slotRes.ok) {
            const slotData = await slotRes.json()
            currentSlot = slotData.slot || 999999
          }
        } catch (e) {
          console.error('Failed to fetch current slot:', e)
        }

        // Fetch reconstructed state for each token (transaction-based, matches dashboard)
        const tokensWithCapTable = await Promise.all(
          data.map(async (t: any) => {
            let issuedSupply = 0
            let holders = 0
            let features: TokenFeatures = {}

            // Fetch reconstructed state from transactions (same as dashboard)
            try {
              const stateRes = await fetch(`${apiUrl}/tokens/${t.token_id}/captable/state/${currentSlot}`)
              if (stateRes.ok) {
                const state = await stateRes.json()
                issuedSupply = state.total_supply || 0
                holders = state.holder_count || 0
              }
            } catch (e) {
              console.error(`Failed to fetch state for token ${t.token_id}:`, e)
            }

            // Fetch token details with features
            try {
              const detailRes = await fetch(`${apiUrl}/factory/tokens/${t.token_id}`)
              if (detailRes.ok) {
                const detail = await detailRes.json()
                features = detail.features || {}
              }
            } catch (e) {
              console.error(`Failed to fetch token details for token ${t.token_id}:`, e)
            }

            return {
              id: t.token_id,
              symbol: t.symbol,
              name: t.name,
              mintAddress: t.mint_address,
              issuedSupply,
              decimals: t.decimals || 6,
              holders,
              isPaused: t.is_paused,
              createdAt: t.created_at,
              features,
            }
          })
        )
        setTokens(tokensWithCapTable)
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
            <CardTitle className="text-sm font-medium">Issued Supply</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : tokens.reduce((sum, t) => sum + t.issuedSupply, 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground">total minted shares</p>
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
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Supply</p>
                  <p className="font-medium">{token.issuedSupply.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Holders</p>
                  <p className="font-medium">{token.holders}</p>
                </div>
              </div>

              {/* Token Features */}
              {token.features && Object.keys(token.features).length > 0 && (
                <div className="pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Features</p>
                  <div className="flex flex-wrap gap-2">
                    {token.features.vesting_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-500/10 text-blue-500 rounded text-xs">
                        <Calendar className="h-3 w-3" />
                        Vesting
                      </span>
                    )}
                    {token.features.governance_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 text-purple-500 rounded text-xs">
                        <Vote className="h-3 w-3" />
                        Governance
                      </span>
                    )}
                    {token.features.dividends_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-500 rounded text-xs">
                        <DollarSign className="h-3 w-3" />
                        Dividends
                      </span>
                    )}
                    {token.features.transfer_restrictions_enabled && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-500/10 text-orange-500 rounded text-xs">
                        <Lock className="h-3 w-3" />
                        Restricted
                      </span>
                    )}
                    {token.features.upgradeable && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-500/10 text-gray-500 rounded text-xs">
                        <Settings className="h-3 w-3" />
                        Upgradeable
                      </span>
                    )}
                  </div>
                  {/* Multi-sig info */}
                  {token.features.admin_signers && token.features.admin_signers.length > 0 && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                      <Shield className="h-3 w-3" />
                      <span>
                        Multi-sig: {token.features.admin_threshold || 1} of {token.features.admin_signers.length} signers
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-[200px]">{token.mintAddress}</span>
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
