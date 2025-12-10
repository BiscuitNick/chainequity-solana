'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, DollarSign, RefreshCw, AlertCircle, Coins, CheckCircle, Clock, XCircle, Send } from 'lucide-react'
import { api, DividendRound, DividendPayment } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'

// Helper to format dates nicely
const formatDate = (dateStr: string | null | undefined) => {
  if (!dateStr) return '—'
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

export default function DividendsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [dividendRounds, setDividendRounds] = useState<DividendRound[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [mintedShares, setMintedShares] = useState<number>(0)
  const [holderCount, setHolderCount] = useState<number>(0)
  // Track payments per round using a map (roundId -> payments[])
  const [paymentsByRound, setPaymentsByRound] = useState<Record<number, DividendPayment[]>>({})
  const [retryingRoundId, setRetryingRoundId] = useState<number | null>(null)

  // Create distribution form state
  const [totalPool, setTotalPool] = useState('')
  const [paymentToken, setPaymentToken] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchDividendRounds = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getDividendRounds(selectedToken.tokenId)
      setDividendRounds(data)
    } catch (e: any) {
      console.error('Failed to fetch dividend rounds:', e)
      setError(e.detail || 'Failed to fetch dividend rounds')
      setDividendRounds([])
    } finally {
      setLoading(false)
    }
  }

  const fetchMintedShares = async () => {
    if (!selectedToken) return
    try {
      // Use transaction-based reconstruction for consistency
      const currentSlotResponse = await api.getCurrentSlot().catch(() => ({ slot: 0 }))
      const currentSlot = currentSlotResponse.slot || 0

      if (currentSlot > 0) {
        const state = await api.getReconstructedStateAtSlot(selectedToken.tokenId, currentSlot).catch(() => null)
        if (state) {
          setMintedShares(state.total_supply || 0)
          setHolderCount(state.holder_count || 0)
          return
        }
      }

      // Fallback to cap table API
      const capTable = await api.getCapTable(selectedToken.tokenId)
      setMintedShares(capTable.total_supply || 0)
      setHolderCount(capTable.holder_count || 0)
    } catch (e: any) {
      console.error('Failed to fetch cap table:', e)
      setMintedShares(0)
      setHolderCount(0)
    }
  }

  const fetchPaymentsForRound = async (roundId: number) => {
    if (!selectedToken) return
    try {
      const data = await api.getDividendClaims(selectedToken.tokenId, roundId)
      setPaymentsByRound(prev => ({ ...prev, [roundId]: data }))
    } catch (e: any) {
      console.error('Failed to fetch payments for round', roundId, ':', e)
      setPaymentsByRound(prev => ({ ...prev, [roundId]: [] }))
    }
  }

  // Fetch payments for recent rounds
  const fetchAllPayments = async () => {
    // Fetch payments for the most recent rounds
    const recentRounds = dividendRounds.slice(0, 5)
    for (const round of recentRounds) {
      await fetchPaymentsForRound(round.id)
    }
  }

  useEffect(() => {
    fetchDividendRounds()
    fetchMintedShares()
  }, [selectedToken])

  // Fetch payments when rounds change
  useEffect(() => {
    if (dividendRounds.length > 0) {
      fetchAllPayments()
    }
  }, [dividendRounds, selectedToken])

  // Auto-refresh distributing rounds
  useEffect(() => {
    const distributingRounds = dividendRounds.filter(r => r.status === 'distributing')
    if (distributingRounds.length > 0) {
      const interval = setInterval(() => {
        fetchDividendRounds()
      }, 2000) // Poll every 2 seconds while distributing
      return () => clearInterval(interval)
    }
  }, [dividendRounds])

  const handleRetryFailed = async (roundId: number) => {
    if (!selectedToken) return
    setRetryingRoundId(roundId)
    setError(null)
    try {
      const result = await api.retryFailedDistributions(selectedToken.tokenId, roundId)
      setSuccess(`Retrying ${result.count} failed distributions...`)
      fetchDividendRounds()
    } catch (e: any) {
      console.error('Failed to retry distributions:', e)
      setError(e.detail || 'Failed to retry distributions')
    } finally {
      setRetryingRoundId(null)
    }
  }

  const resetForm = () => {
    setTotalPool('')
    setPaymentToken('')
  }

  const handleCreateDistribution = async () => {
    if (!selectedToken || !totalPool || !paymentToken) return

    setSubmitting(true)
    setError(null)

    try {
      await api.createDividendRound(selectedToken.tokenId, {
        total_pool: parseInt(totalPool),
        payment_token: paymentToken,
      })
      setShowCreateModal(false)
      resetForm()
      setSuccess(`Distribution created! Automatically sending to ${holderCount} shareholders...`)
      fetchDividendRounds()
    } catch (e: any) {
      console.error('Failed to create dividend distribution:', e)
      setError(e.detail || 'Failed to create dividend distribution')
    } finally {
      setSubmitting(false)
    }
  }

  // Calculate amount per share preview (based on minted shares only)
  const previewPerShare = totalPool && mintedShares > 0
    ? (parseInt(totalPool) / mintedShares).toFixed(6)
    : '0'

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    distributing: 'bg-blue-500/10 text-blue-500',
    completed: 'bg-green-500/10 text-green-500',
    failed: 'bg-red-500/10 text-red-500',
  }

  const statusIcons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-4 w-4" />,
    distributing: <RefreshCw className="h-4 w-4 animate-spin" />,
    completed: <CheckCircle className="h-4 w-4" />,
    failed: <XCircle className="h-4 w-4" />,
  }

  const totalDistributed = dividendRounds.reduce((sum, r) => sum + (r.total_distributed || 0), 0)
  const completedRounds = dividendRounds.filter(r => r.status === 'completed')
  const distributingRounds = dividendRounds.filter(r => r.status === 'distributing')

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
            Auto-distribute dividends to {selectedToken.symbol} holders
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
        <Alert className="border-red-500/50 bg-red-500/10">
          <AlertCircle className="h-4 w-4 text-red-500" />
          <AlertDescription className="text-red-500">{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-500/50 bg-green-500/10">
          <CheckCircle className="h-4 w-4 text-green-500" />
          <AlertDescription className="text-green-500">{success}</AlertDescription>
        </Alert>
      )}

      {/* Distributing Alert */}
      {distributingRounds.length > 0 && (
        <Alert className="border-blue-500/50 bg-blue-500/10">
          <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
          <AlertDescription className="text-blue-500">
            <span>
              <span className="font-bold">{distributingRounds.length}</span> distribution
              {distributingRounds.length > 1 ? 's' : ''} in progress...
            </span>
          </AlertDescription>
        </Alert>
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
            <p className="text-xs text-muted-foreground">{completedRounds.length} completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Shareholders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : holderCount}</div>
            <p className="text-xs text-muted-foreground">eligible recipients</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per Share (Latest)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${loading ? '...' : dividendRounds[0]?.amount_per_share?.toFixed(4) ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {dividendRounds[0] ? (
                <WalletAddress address={dividendRounds[0].payment_token} />
              ) : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Render recent distribution rounds */}
      {dividendRounds.slice(0, 5).map((round) => {
        const roundPayments = paymentsByRound[round.id] || []
        const isRetrying = retryingRoundId === round.id
        const progressPercent = round.total_batches > 0
          ? (round.completed_batches / round.total_batches) * 100
          : (round.status === 'completed' ? 100 : 0)

        // Count payment statuses
        const sentCount = roundPayments.filter(p => p.status === 'sent').length
        const failedCount = roundPayments.filter(p => p.status === 'failed').length
        const pendingCount = roundPayments.filter(p => p.status === 'pending').length

        const borderColor = round.status === 'completed' ? 'border-green-500'
          : round.status === 'distributing' ? 'border-blue-500'
          : round.status === 'failed' ? 'border-red-500'
          : 'border-muted'

        return (
          <Card key={round.id} className={borderColor}>
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Distribution Round #{round.round_number}
                  </CardTitle>
                  <CardDescription>
                    {round.status === 'completed'
                      ? `Completed ${formatDate(round.distributed_at)}`
                      : round.status === 'distributing'
                      ? 'Auto-distributing to all shareholders...'
                      : `Created ${formatDate(round.created_at)}`
                    }
                  </CardDescription>
                </div>
                <span className={`px-3 py-1 rounded text-sm flex-shrink-0 flex items-center gap-2 ${statusColors[round.status]}`}>
                  {statusIcons[round.status]}
                  <span className="capitalize">{round.status}</span>
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Pool</p>
                  <p className="text-xl font-bold">${round.total_pool.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Per Share</p>
                  <p className="text-xl font-bold">${round.amount_per_share.toFixed(4)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Recipients</p>
                  <p className="text-xl font-bold">{round.total_recipients}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Distributed</p>
                  <p className="text-xl font-bold">${(round.total_distributed || 0).toLocaleString()}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>
                    {round.status === 'distributing'
                      ? `Batch ${round.completed_batches}/${round.total_batches}`
                      : `${round.distribution_count || sentCount} of ${round.total_recipients} sent`
                    }
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      round.status === 'completed' ? 'bg-green-500'
                      : round.status === 'failed' ? 'bg-red-500'
                      : 'bg-blue-500'
                    }`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Retry button for failed distributions */}
              {failedCount > 0 && (
                <div className="mt-4">
                  <Button
                    variant="outline"
                    className="w-full border-red-500 text-red-500 hover:bg-red-500/10"
                    onClick={() => handleRetryFailed(round.id)}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Retrying...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Retry {failedCount} Failed Distributions
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Payments table */}
              {roundPayments.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <h4 className="font-medium mb-3">Distribution Details</h4>
                  <div className="overflow-x-auto max-h-64 overflow-y-auto">
                    <table className="w-full text-sm table-fixed">
                      <thead className="sticky top-0 bg-background">
                        <tr className="border-b">
                          <th className="text-left py-2 px-2 font-medium w-28">Wallet</th>
                          <th className="text-right py-2 px-2 font-medium w-24">$/Share</th>
                          <th className="text-right py-2 px-2 font-medium w-20">Shares</th>
                          <th className="text-right py-2 px-2 font-medium w-24">Total</th>
                          <th className="text-center py-2 px-2 font-medium w-20">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roundPayments.map((payment) => (
                          <tr key={payment.id} className="border-b hover:bg-muted/50">
                            <td className="py-2 px-2">
                              <WalletAddress address={payment.wallet} />
                            </td>
                            <td className="py-2 px-2 text-right text-muted-foreground text-xs">
                              ${payment.dividend_per_share?.toFixed(4) || '—'}
                            </td>
                            <td className="py-2 px-2 text-right text-xs">
                              {(payment.shares || 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-right font-medium text-xs">
                              ${(payment.amount || 0).toLocaleString()}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                                payment.status === 'sent' ? 'bg-green-500/10 text-green-500'
                                : payment.status === 'failed' ? 'bg-red-500/10 text-red-500'
                                : 'bg-yellow-500/10 text-yellow-500'
                              }`}>
                                {payment.status === 'sent' ? <CheckCircle className="h-3 w-3" />
                                  : payment.status === 'failed' ? <XCircle className="h-3 w-3" />
                                  : <Clock className="h-3 w-3" />
                                }
                                {payment.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {/* Distribution History */}
      {dividendRounds.length > 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Distribution History</CardTitle>
            <CardDescription>All dividend distributions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Round</th>
                    <th className="text-left py-3 px-4 font-medium">Total Pool</th>
                    <th className="text-left py-3 px-4 font-medium">Per Share</th>
                    <th className="text-left py-3 px-4 font-medium">Recipients</th>
                    <th className="text-left py-3 px-4 font-medium">Status</th>
                    <th className="text-left py-3 px-4 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {dividendRounds.slice(5).map((round) => (
                    <tr key={round.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-medium">#{round.round_number}</td>
                      <td className="py-3 px-4">${round.total_pool.toLocaleString()}</td>
                      <td className="py-3 px-4">${round.amount_per_share.toFixed(4)}</td>
                      <td className="py-3 px-4">{round.total_recipients}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs capitalize ${statusColors[round.status]}`}>
                          {statusIcons[round.status]}
                          {round.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{formatDate(round.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {dividendRounds.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Distributions Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first dividend distribution to automatically send payments to all shareholders.
              </p>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Distribution
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Create Distribution Modal */}
      <Dialog open={showCreateModal} onOpenChange={(open) => { setShowCreateModal(open); if (!open) resetForm(); }}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Create Dividend Distribution</DialogTitle>
            <DialogDescription>
              Automatically distribute dividends to all {selectedToken?.symbol} token holders.
              Payments will be sent immediately to {holderCount} shareholders.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="total-pool">Total Distribution Amount</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="total-pool"
                  type="number"
                  placeholder="Enter total amount to distribute..."
                  value={totalPool}
                  onChange={(e) => setTotalPool(e.target.value)}
                  className="pl-9"
                />
              </div>
              {totalPool && mintedShares > 0 && (
                <p className="text-xs text-muted-foreground">
                  ~${previewPerShare} per share ({mintedShares.toLocaleString()} minted shares)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-token">Payment Token Address</Label>
              <Input
                id="payment-token"
                placeholder="Enter payment token mint address (e.g., USDC)..."
                value={paymentToken}
                onChange={(e) => setPaymentToken(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The SPL token that will be distributed to holders
              </p>
            </div>

            {totalPool && (
              <Alert>
                <Send className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Distribution Preview</p>
                    <p className="text-sm">Total Pool: ${parseInt(totalPool).toLocaleString()}</p>
                    <p className="text-sm">Per Share: ${previewPerShare}</p>
                    <p className="text-sm">Recipients: {holderCount} shareholders</p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Payments will be sent automatically upon creation.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateDistribution}
              disabled={!totalPool || !paymentToken || submitting}
            >
              {submitting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Distribute Now
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
