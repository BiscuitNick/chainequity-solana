'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, DollarSign, RefreshCw, AlertCircle, CheckCircle, Clock, XCircle, Send, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import { api, DividendRound, DividendPayment, UnifiedTransaction } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
import { Button as ToastButton } from '@/components/ui/button'

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
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
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
  // Transaction-based dividend data (source of truth)
  const [dividendTransactions, setDividendTransactions] = useState<UnifiedTransaction[]>([])
  // Track which rounds have expanded details
  const [expandedRounds, setExpandedRounds] = useState<Set<number>>(new Set())

  const isViewingHistorical = selectedSlot !== null

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
      const data = await api.getDividendPayments(selectedToken.tokenId, roundId)
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

  // Fetch dividend transactions (source of truth)
  const fetchDividendTransactions = async () => {
    if (!selectedToken) return
    try {
      const data = await api.getUnifiedTransactions(
        selectedToken.tokenId,
        1000,  // high limit to get all dividend transactions
        selectedSlot ?? undefined,  // filter by max slot if viewing historical
        'dividend_payment'
      )
      setDividendTransactions(data)
    } catch (e: any) {
      console.error('Failed to fetch dividend transactions:', e)
      setDividendTransactions([])
    }
  }


  useEffect(() => {
    fetchDividendRounds()
    fetchMintedShares()
    fetchDividendTransactions()
  }, [selectedToken, selectedSlot])

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

  // Build dividend round data from transactions (source of truth)
  // Group transactions by round_number from their data
  const transactionBasedRounds = (() => {
    if (dividendTransactions.length === 0) return []

    const roundsMap: Record<number, {
      round_number: number
      payments: typeof dividendTransactions
      total_pool: number
      amount_per_share: number
      total_recipients: number
      total_distributed: number
      created_at: string
    }> = {}

    for (const tx of dividendTransactions) {
      const txData = tx.data as any
      const roundNumber = txData?.round_number || 1

      if (!roundsMap[roundNumber]) {
        roundsMap[roundNumber] = {
          round_number: roundNumber,
          payments: [],
          total_pool: 0,
          amount_per_share: txData?.dividend_per_share || 0,
          total_recipients: 0,
          total_distributed: 0,
          created_at: tx.created_at,
        }
      }

      roundsMap[roundNumber].payments.push(tx)
      roundsMap[roundNumber].total_distributed += tx.amount || 0
      roundsMap[roundNumber].total_recipients += 1
    }

    // Calculate total pool from distributed amount
    for (const round of Object.values(roundsMap)) {
      round.total_pool = round.total_distributed
    }

    return Object.values(roundsMap).sort((a, b) => b.round_number - a.round_number)
  })()

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

  // Use transaction-based data as source of truth for display
  const totalDistributed = transactionBasedRounds.reduce((sum, r) => sum + r.total_distributed, 0)
  const roundCount = transactionBasedRounds.length
  const latestPerShare = transactionBasedRounds[0]?.amount_per_share || 0

  // Keep API-based for distributing status (in-progress rounds)
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
      {isViewingHistorical && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-400">
              Viewing historical dividend data up to slot #{selectedSlot?.toLocaleString()}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedSlot(null)}
              className="ml-4 text-amber-700 border-amber-500/50 hover:bg-amber-500/20"
            >
              Return to Live
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dividends</h1>
          <p className="text-muted-foreground">
            Auto-distribute dividends to {selectedToken.symbol} holders
            {isViewingHistorical && ' (Historical)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { fetchDividendRounds(); fetchMintedShares(); fetchDividendTransactions(); }} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!isViewingHistorical && (
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Distribution
            </Button>
          )}
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
            <div className="text-2xl font-bold">{loading ? '...' : roundCount}</div>
            <p className="text-xs text-muted-foreground">{roundCount} completed</p>
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
              ${loading ? '...' : latestPerShare > 0 ? latestPerShare.toFixed(4) : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {roundCount > 0 ? 'last distribution' : '—'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Render distribution rounds from transactions (source of truth) */}
      {transactionBasedRounds.map((round) => {
        const isExpanded = expandedRounds.has(round.round_number)
        const toggleExpanded = () => {
          setExpandedRounds(prev => {
            const next = new Set(prev)
            if (next.has(round.round_number)) {
              next.delete(round.round_number)
            } else {
              next.add(round.round_number)
            }
            return next
          })
        }

        return (
          <Card key={round.round_number} className="border-green-500">
            <CardHeader>
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Distribution Round #{round.round_number}
                  </CardTitle>
                  <CardDescription>
                    Completed {formatDate(round.created_at)}
                  </CardDescription>
                </div>
                <span className="px-3 py-1 rounded text-sm flex-shrink-0 flex items-center gap-2 bg-green-500/10 text-green-500">
                  <CheckCircle className="h-4 w-4" />
                  <span className="capitalize">completed</span>
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
                  <p className="text-xl font-bold">${round.total_distributed.toLocaleString()}</p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-4">
                <div className="flex justify-between text-sm mb-1">
                  <span>Progress</span>
                  <span>{round.total_recipients} of {round.total_recipients} sent</span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="h-2 rounded-full transition-all bg-green-500" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Collapsible Payments table from transactions */}
              {round.payments.length > 0 && (
                <div className="mt-6 pt-6 border-t">
                  <button
                    onClick={toggleExpanded}
                    className="flex items-center gap-2 font-medium mb-3 hover:text-primary transition-colors w-full text-left"
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    Distribution Details ({round.payments.length} payments)
                  </button>
                  {isExpanded && (
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
                          {round.payments.map((tx) => {
                            const txData = tx.data as any
                            return (
                              <tr key={tx.id} className="border-b hover:bg-muted/50">
                                <td className="py-2 px-2">
                                  <WalletAddress address={tx.wallet_to || ''} />
                                </td>
                                <td className="py-2 px-2 text-right text-muted-foreground text-xs">
                                  ${txData?.dividend_per_share?.toFixed(4) || '—'}
                                </td>
                                <td className="py-2 px-2 text-right text-xs">
                                  {(txData?.shares || 0).toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-right font-medium text-xs">
                                  ${(tx.amount || 0).toLocaleString()}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-500">
                                    <CheckCircle className="h-3 w-3" />
                                    sent
                                  </span>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}

      {transactionBasedRounds.length === 0 && !loading && (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Distributions Yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first dividend distribution to automatically send payments to all shareholders.
              </p>
              {!isViewingHistorical && (
                <Button onClick={() => setShowCreateModal(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Distribution
                </Button>
              )}
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
