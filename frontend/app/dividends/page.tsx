'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, DollarSign, Users, Clock, CheckCircle, RefreshCw } from 'lucide-react'
import { api, DividendRound } from '@/lib/api'

export default function DividendsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [dividendRounds, setDividendRounds] = useState<DividendRound[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchDividendRounds = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getDividendRounds(selectedToken.id)
      setDividendRounds(data)
    } catch (e: any) {
      console.error('Failed to fetch dividend rounds:', e)
      setError(e.detail || 'Failed to fetch dividend rounds')
      setDividendRounds([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchDividendRounds()
  }, [selectedToken])

  const handleClaim = async (roundId: number) => {
    if (!selectedToken) return
    try {
      await api.claimDividend(selectedToken.id, roundId)
      fetchDividendRounds()
    } catch (e: any) {
      console.error('Failed to claim dividend:', e)
      setError(e.detail || 'Failed to claim dividend')
    }
  }

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    active: 'bg-green-500/10 text-green-500',
    completed: 'bg-blue-500/10 text-blue-500',
  }

  const totalDistributed = dividendRounds.reduce((sum, r) => sum + r.total_pool, 0)
  const activeRound = dividendRounds.find(r => r.status === 'active')

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage dividends
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dividends</h1>
          <p className="text-muted-foreground">
            Distribute dividends to {selectedToken.symbol} holders
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchDividendRounds} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Distribution
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Distributed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${loading ? '...' : totalDistributed.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">all time</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Distribution Rounds</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : dividendRounds.length}</div>
            <p className="text-xs text-muted-foreground">total</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Round</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : activeRound ? `$${activeRound.total_pool.toLocaleString()}` : 'None'}
            </div>
            <p className="text-xs text-muted-foreground">
              {activeRound ? `${activeRound.claimed_count}/${activeRound.total_eligible} claimed` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per Share (Latest)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${loading ? '...' : dividendRounds[0]?.amount_per_share?.toFixed(2) ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">{dividendRounds[0]?.payment_token || '—'}</p>
          </CardContent>
        </Card>
      </div>

      {activeRound && (
        <Card className="border-green-500">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  Active Distribution Round #{activeRound.id}
                </CardTitle>
                <CardDescription>Claim your dividends before the expiration date</CardDescription>
              </div>
              <span className={`px-3 py-1 rounded text-sm ${statusColors.active}`}>
                Active
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <p className="text-sm text-muted-foreground">Total Pool</p>
                <p className="text-xl font-bold">${activeRound.total_pool.toLocaleString()} {activeRound.payment_token}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Per Share</p>
                <p className="text-xl font-bold">${activeRound.amount_per_share.toFixed(2)} {activeRound.payment_token}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Expires</p>
                <p className="text-xl font-bold">{activeRound.expires_at || '—'}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Claims progress</span>
                <span>{activeRound.claimed_count} / {activeRound.total_eligible}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-2">
                <div
                  className="bg-green-500 h-2 rounded-full transition-all"
                  style={{ width: `${activeRound.total_eligible > 0 ? (activeRound.claimed_count / activeRound.total_eligible) * 100 : 0}%` }}
                />
              </div>
            </div>
            <div className="mt-4">
              <Button className="w-full" onClick={() => handleClaim(activeRound.id)}>
                <DollarSign className="h-4 w-4 mr-2" />
                Claim Dividend
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Distribution History</CardTitle>
          <CardDescription>Past dividend distributions</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : dividendRounds.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No dividend distributions found
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Round</th>
                    <th className="text-left py-3 px-4 font-medium">Total Pool</th>
                    <th className="text-left py-3 px-4 font-medium">Per Share</th>
                    <th className="text-left py-3 px-4 font-medium">Token</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Claims</th>
                    <th className="text-left py-3 px-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendRounds.map((round) => (
                    <tr key={round.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">#{round.id}</td>
                      <td className="py-3 px-4">${round.total_pool.toLocaleString()}</td>
                      <td className="py-3 px-4">${round.amount_per_share.toFixed(2)}</td>
                      <td className="py-3 px-4">{round.payment_token}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[round.status]}`}>
                          {round.status}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {round.claimed_count} / {round.total_eligible}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{round.created_at}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
