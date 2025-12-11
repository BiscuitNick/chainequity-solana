'use client'

import { useEffect, useState, Fragment, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppStore } from '@/stores/useAppStore'
import api, { CapTableResponse, Proposal, TransferStatsResponse, IssuanceStatsResponse, UnifiedTransaction, ReconstructedState, EnhancedCapTableResponse, EnhancedCapTableByWalletResponse } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
import { OwnershipDistribution } from '@/components/OwnershipDistribution'
import { AlertTriangle, Copy, History, Check, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Combined activity type for displaying all unified transactions
type Activity = {
  id: string
  type: string  // tx_type from unified transactions
  from: string
  to: string
  amount: number | null
  timestamp: string
  status: string
  slot?: number
  shareClass?: string  // For share grants
  txSignature?: string
  notes?: string
  data?: Record<string, any> | null
  // Stock split specific
  splitNumerator?: number
  splitDenominator?: number
  // Cost basis / total amount (in cents)
  amountSecondary?: number | null
}

type ActivityFilter = 'all' | 'shares' | 'transfer' | 'approval' | 'dividend_payment' | 'stock_split' | 'funding_round' | 'other'

const ITEMS_PER_PAGE = 10

export default function DashboardPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [reconstructedState, setReconstructedState] = useState<ReconstructedState | null>(null)
  const [enhancedCapTable, setEnhancedCapTable] = useState<EnhancedCapTableResponse | null>(null)
  const [enhancedCapTableByWallet, setEnhancedCapTableByWallet] = useState<EnhancedCapTableByWalletResponse | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [transferStats, setTransferStats] = useState<TransferStatsResponse | null>(null)
  const [issuanceStats, setIssuanceStats] = useState<IssuanceStatsResponse | null>(null)
  const [allActivity, setAllActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  // Filter and pagination state
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all')
  const [currentPage, setCurrentPage] = useState(1)

  const isViewingHistorical = selectedSlot !== null

  // Filter activities based on selected filter
  const knownTypes = ['transfer', 'mint', 'share_grant', 'investment', 'approval', 'convertible_convert', 'dividend_payment', 'vesting_release', 'stock_split', 'funding_round_create', 'funding_round_close']
  // Share-related types for "Shares" filter
  const shareTypes = ['mint', 'share_grant', 'investment', 'vesting_release', 'convertible_convert']
  const filteredActivity = activityFilter === 'all'
    ? allActivity
    : activityFilter === 'other'
    ? allActivity.filter(a => !knownTypes.includes(a.type))
    : activityFilter === 'funding_round'
    ? allActivity.filter(a => a.type === 'funding_round_create' || a.type === 'funding_round_close')
    : activityFilter === 'shares'
    ? allActivity.filter(a => shareTypes.includes(a.type))
    : allActivity.filter(a => a.type === activityFilter)

  // Paginate
  const totalPages = Math.ceil(filteredActivity.length / ITEMS_PER_PAGE)
  const paginatedActivity = filteredActivity.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [activityFilter])

  const copySlotToClipboard = (slot: number) => {
    navigator.clipboard.writeText(slot.toString())
    setCopiedSlot(slot)
    setTimeout(() => setCopiedSlot(null), 2000)
  }

  const viewHistoricalSlot = (slot: number) => {
    setCurrentPage(1) // Reset to first page when viewing historical state
    setSelectedSlot(slot)
  }

  const toggleRowExpanded = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Helper function to convert unified transaction to Activity
  const convertTransactionToActivity = (tx: UnifiedTransaction): Activity => {
    // Determine 'from' based on transaction type
    let from = tx.wallet || ''
    let to = tx.wallet_to || tx.wallet || ''

    if (tx.tx_type === 'mint' || tx.tx_type === 'share_grant') {
      // amount_secondary stores cost_basis: 0 = free grant, >0 = investment
      const hasCost = tx.amount_secondary && tx.amount_secondary > 0
      from = hasCost ? 'INVESTMENT' : 'GRANT'
      to = tx.wallet || ''
    } else if (tx.tx_type === 'investment') {
      // Funding round investments always have cost
      from = 'INVESTMENT'
      to = tx.wallet || ''
    } else if (tx.tx_type === 'convertible_convert') {
      // For conversion, show CONVERT as source
      from = 'CONVERT'
      to = tx.wallet || ''
    } else if (tx.tx_type === 'stock_split') {
      // For stock split, from/to represent the ratio
      from = String(tx.data?.denominator || 1)
      to = String(tx.data?.numerator || 1)
    } else if (tx.tx_type === 'vesting_release') {
      // For vesting release, show VESTING as source and recipient wallet as 'to'
      from = 'VESTING'
      to = tx.wallet || ''
    } else if (tx.tx_type === 'dividend_payment') {
      // For dividend payment, show issuer wallet as 'from' and recipient wallet as 'to'
      from = tx.wallet || ''  // Payment token / issuer wallet
      to = tx.wallet_to || ''  // Shareholder receiving dividend
    } else if (tx.tx_type === 'approval' || tx.tx_type === 'revocation') {
      to = tx.wallet || ''
    }

    return {
      id: `tx-${tx.id}`,
      type: tx.tx_type,
      from,
      to,
      amount: tx.amount,
      timestamp: tx.created_at,
      status: 'completed',
      slot: tx.slot,
      shareClass: tx.data?.share_class_symbol || tx.data?.share_class_name,
      txSignature: tx.tx_signature || undefined,
      notes: tx.notes || undefined,
      data: tx.data,
      splitNumerator: tx.data?.numerator,
      splitDenominator: tx.data?.denominator,
      amountSecondary: tx.amount_secondary,
    }
  }

  useEffect(() => {
    if (selectedToken?.tokenId === undefined || selectedToken?.tokenId === null) return

    const fetchData = async () => {
      setLoading(true)
      setReconstructedState(null)
      try {
        if (isViewingHistorical && selectedSlot !== null) {
          // Use on-the-fly state reconstruction + fetch unified transactions up to that slot
          const [state, transactions] = await Promise.all([
            api.getReconstructedStateAtSlot(selectedToken.tokenId, selectedSlot).catch((err) => {
              console.error('Failed to reconstruct state:', err)
              return null
            }),
            api.getUnifiedTransactions(selectedToken.tokenId, 100, selectedSlot).catch(() => []),
          ])

          if (state) {
            setReconstructedState(state)
            // Convert reconstructed state to CapTableResponse format for display
            const holders = Object.entries(state.balances)
              .filter(([_, balance]) => balance > 0)
              .map(([wallet, balance]) => ({
                wallet,
                balance,
                ownership_pct: state.total_supply > 0 ? (balance / state.total_supply) * 100 : 0,
                vested: 0,
                unvested: 0,
                status: state.approved_wallets.includes(wallet) ? 'active' : 'pending',
              }))
              .sort((a, b) => b.balance - a.balance)

            const capTableFromState: CapTableResponse = {
              slot: state.slot,
              timestamp: new Date().toISOString(),
              total_supply: state.total_supply,
              holder_count: state.holder_count,
              holders,
            }
            setCapTable(capTableFromState)
          }

          // Clear live stats when viewing historical
          setProposals([])
          setTransferStats(null)
          setIssuanceStats(null)

          // Convert unified transactions to activity feed
          const activities: Activity[] = transactions.map(convertTransactionToActivity)

          // Sort by slot descending (most recent first)
          activities.sort((a, b) => (b.slot || 0) - (a.slot || 0))
          setAllActivity(activities)
        } else {
          // Live data - use transaction-based state reconstruction for consistency
          // Get current slot first, then reconstruct state at that slot
          const [currentSlotResponse, transactions, proposalsData, enhancedCapTableData, enhancedCapTableByWalletData] = await Promise.all([
            api.getCurrentSlot().catch(() => ({ slot: 0 })),
            api.getUnifiedTransactions(selectedToken.tokenId, 100).catch(() => []),
            api.getProposals(selectedToken.tokenId, 'active').catch(() => []),
            api.getEnhancedCapTable(selectedToken.tokenId).catch(() => null),
            api.getEnhancedCapTableByWallet(selectedToken.tokenId).catch(() => null),
          ])

          setEnhancedCapTable(enhancedCapTableData)
          setEnhancedCapTableByWallet(enhancedCapTableByWalletData)

          const currentSlot = currentSlotResponse.slot || 0

          // Reconstruct state at current slot (includes all transactions up to now)
          let state: ReconstructedState | null = null
          if (currentSlot > 0) {
            state = await api.getReconstructedStateAtSlot(selectedToken.tokenId, currentSlot).catch((err) => {
              console.error('Failed to reconstruct live state:', err)
              return null
            })
          }

          if (state) {
            setReconstructedState(state)
            // Convert reconstructed state to CapTableResponse format for display
            const holders = Object.entries(state.balances)
              .filter(([_, balance]) => balance > 0)
              .map(([wallet, balance]) => ({
                wallet,
                balance,
                ownership_pct: state.total_supply > 0 ? (balance / state.total_supply) * 100 : 0,
                vested: 0,
                unvested: 0,
                status: state.approved_wallets.includes(wallet) ? 'active' : 'pending',
              }))
              .sort((a, b) => b.balance - a.balance)

            const capTableFromState: CapTableResponse = {
              slot: state.slot,
              timestamp: new Date().toISOString(),
              total_supply: state.total_supply,
              holder_count: state.holder_count,
              holders,
            }
            setCapTable(capTableFromState)
          } else {
            // Fallback to API cap table if reconstruction fails
            const capTableData = await api.getCapTable(selectedToken.tokenId).catch(() => null)
            setCapTable(capTableData)
          }

          setProposals(proposalsData)
          // Clear transfer/issuance stats since we're using transactions
          setTransferStats(null)
          setIssuanceStats(null)

          // Convert unified transactions to activity feed
          const activities: Activity[] = transactions.map(convertTransactionToActivity)

          // Sort by slot descending (most recent first)
          activities.sort((a, b) => (b.slot || 0) - (a.slot || 0))
          setAllActivity(activities)
        }
      } catch (error: any) {
        console.error('Failed to fetch dashboard data:', error?.message || error?.detail || error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedToken?.tokenId, selectedSlot, isViewingHistorical])

  const activeProposalsCount = proposals.filter(p => p.status === 'active').length
  // For live view, use 24h stats; for historical, show total activity count
  const activity24h = isViewingHistorical
    ? allActivity.length
    : (transferStats?.transfers_24h ?? 0) + (issuanceStats?.issuances_24h ?? 0)

  // Count activities by type for the stats display
  const mintCount = allActivity.filter(a => a.type === 'mint').length
  const transferCount = allActivity.filter(a => a.type === 'transfer').length
  const shareGrantCount = allActivity.filter(a => a.type === 'share_grant').length

  // Build holders with cost_basis from enhanced cap table by wallet
  const holdersWithCostBasis = useMemo(() => {
    const holders = capTable?.holders || []
    if (!enhancedCapTableByWallet?.wallets) return holders

    // Create a map of wallet -> total_cost_basis from enhanced cap table
    const costBasisMap = new Map<string, number>()
    for (const walletSummary of enhancedCapTableByWallet.wallets) {
      costBasisMap.set(walletSummary.wallet, walletSummary.total_cost_basis)
    }

    // Merge cost_basis into holders
    return holders.map(holder => ({
      ...holder,
      cost_basis: costBasisMap.get(holder.wallet),
    }))
  }, [capTable?.holders, enhancedCapTableByWallet?.wallets])

  // Helper to check if a field is relevant for a transaction type
  const isFieldRelevant = (activity: Activity, field: 'from' | 'to' | 'amount') => {
    const type = activity.type
    switch (field) {
      case 'from':
        return ['transfer', 'mint', 'share_grant', 'investment', 'stock_split', 'convertible_convert', 'vesting_release', 'dividend_payment'].includes(type)
      case 'to':
        return ['transfer', 'mint', 'share_grant', 'investment', 'approval', 'revocation', 'stock_split', 'convertible_convert', 'vesting_release', 'dividend_payment'].includes(type)
      case 'amount':
        return ['transfer', 'mint', 'share_grant', 'investment', 'burn', 'convertible_convert', 'vesting_release', 'dividend_payment'].includes(type)
      default:
        return true
    }
  }

  // Format local time (backend returns UTC without Z suffix)
  const formatLocalTime = (timestamp: string) => {
    const utcTimestamp = timestamp.endsWith('Z') ? timestamp : timestamp + 'Z'
    return new Date(utcTimestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  // Show empty state when no token is selected
  if (!selectedToken) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Overview of your tokenized securities</p>
        </div>
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="text-center space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <AlertTriangle className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No Tokens Available</h3>
                <p className="text-muted-foreground mt-1">
                  Create your first token to get started with ChainEquity.
                </p>
              </div>
              <Button asChild>
                <a href="/tokens">Go to Tokens Page</a>
              </Button>
            </div>
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
              Viewing historical data at slot #{selectedSlot?.toLocaleString()}
              {reconstructedState && reconstructedState.slot !== selectedSlot && (
                <span className="text-xs ml-2">(reconstructed from transactions)</span>
              )}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setCurrentPage(1); setSelectedSlot(null); }}
              className="ml-4 text-amber-700 border-amber-500/50 hover:bg-amber-500/20"
            >
              Return to Live
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {selectedToken
            ? `Overview for ${selectedToken.symbol}${isViewingHistorical ? ' (Historical)' : ''}`
            : 'Select a token to view details'}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Supply</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {capTable?.total_supply?.toLocaleString() ?? selectedToken?.totalSupply?.toLocaleString() ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">shares</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Holders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {capTable?.holder_count ?? '—'}
            </div>
            <p className="text-xs text-muted-foreground">shareholders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              {isViewingHistorical ? 'Activity (Total)' : 'Activity (24h)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activity24h > 0 ? activity24h : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {isViewingHistorical
                ? `${mintCount} mints, ${transferCount} transfers, ${shareGrantCount} grants`
                : `${issuanceStats?.issuances_24h ?? 0} mints, ${transferStats?.transfers_24h ?? 0} transfers`
              }
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activeProposalsCount > 0 ? activeProposalsCount : '—'}
            </div>
            <p className="text-xs text-muted-foreground">governance votes</p>
          </CardContent>
        </Card>
      </div>

      <OwnershipDistribution
        holders={holdersWithCostBasis}
        loading={loading}
        title="Ownership Distribution"
        description="Token holder breakdown"
        pricePerShare={enhancedCapTable?.price_per_share}
        tokenId={selectedToken?.tokenId}
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest token movements and issuances</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as ActivityFilter)}
              className="text-sm border rounded px-2 py-1 bg-background"
            >
              <option value="all">All Activity ({allActivity.length})</option>
              <option value="shares">Shares ({allActivity.filter(a => shareTypes.includes(a.type)).length})</option>
              <option value="transfer">Transfers ({allActivity.filter(a => a.type === 'transfer').length})</option>
              <option value="dividend_payment">Dividends ({allActivity.filter(a => a.type === 'dividend_payment').length})</option>
              <option value="stock_split">Stock Splits ({allActivity.filter(a => a.type === 'stock_split').length})</option>
              <option value="funding_round">Funding Rounds ({allActivity.filter(a => a.type === 'funding_round_create' || a.type === 'funding_round_close').length})</option>
              <option value="approval">Approvals ({allActivity.filter(a => a.type === 'approval').length})</option>
              <option value="other">Other ({allActivity.filter(a => !knownTypes.includes(a.type)).length})</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">Loading...</p>
            </div>
          ) : paginatedActivity.length > 0 ? (
            <TooltipProvider>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium">Type</th>
                      <th className="text-left py-2 px-2 font-medium">From</th>
                      <th className="text-left py-2 px-2 font-medium">To</th>
                      <th className="text-right py-2 px-2 font-medium">Shares</th>
                      <th className="text-right py-2 px-2 font-medium">Total</th>
                      <th className="text-left py-2 px-2 font-medium">Date & Time</th>
                      <th className="text-left py-2 px-2 font-medium">Slot</th>
                      <th className="text-center py-2 px-2 font-medium">Status</th>
                      <th className="text-center py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedActivity.map((activity) => (
                      <Fragment key={activity.id}>
                        <tr
                          className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                          onClick={() => toggleRowExpanded(activity.id)}
                        >
                          <td className="py-2 px-2">
                            <div className="flex items-center gap-1">
                              {expandedRows.has(activity.id) ? (
                                <ChevronUp className="h-3 w-3 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="h-3 w-3 text-muted-foreground" />
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                                // All share-related types get purple styling
                                ['mint', 'share_grant', 'investment', 'vesting_release', 'convertible_convert'].includes(activity.type)
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                  : activity.type === 'transfer'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : activity.type === 'approval'
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : activity.type === 'stock_split'
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                  : activity.type === 'dividend_payment'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  : (activity.type === 'funding_round_create' || activity.type === 'funding_round_close')
                                  ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                              }`}>
                                {/* All share issuances show as SHARES */}
                                {['mint', 'share_grant', 'investment', 'vesting_release', 'convertible_convert'].includes(activity.type)
                                  ? 'SHARES'
                                  : activity.type === 'transfer' ? 'TRANSFER'
                                  : activity.type === 'approval' ? 'APPROVAL'
                                  : activity.type === 'stock_split' ? 'SPLIT'
                                  : activity.type === 'dividend_payment' ? 'DIVIDEND'
                                  : (activity.type === 'funding_round_create' || activity.type === 'funding_round_close') ? 'FUNDING ROUND'
                                  : activity.type.toUpperCase().replace('_', ' ')}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            {!isFieldRelevant(activity, 'from') ? (
                              <span className="text-muted-foreground">—</span>
                            ) : activity.type === 'stock_split' ? (
                              <span className="font-mono text-xs font-medium">{activity.splitDenominator || activity.from}</span>
                            ) : ['GRANT', 'INVESTMENT', 'CONVERT', 'VESTING'].includes(activity.from) ? (
                              <span className="font-mono text-xs">{activity.from}</span>
                            ) : activity.from ? (
                              <WalletAddress address={activity.from} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {!isFieldRelevant(activity, 'to') ? (
                              <span className="text-muted-foreground">—</span>
                            ) : activity.type === 'stock_split' ? (
                              <span className="font-mono text-xs font-medium">{activity.splitNumerator || activity.to}</span>
                            ) : activity.to ? (
                              <WalletAddress address={activity.to} />
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                            {/* For dividends, show shares_held from data or amountSecondary; otherwise show amount */}
                            {!isFieldRelevant(activity, 'amount') ? (
                              <span className="text-muted-foreground">—</span>
                            ) : activity.type === 'dividend_payment' ? (
                              (activity.data?.shares_held || activity.amountSecondary)?.toLocaleString() ?? <span className="text-muted-foreground">—</span>
                            ) : activity.amount !== null && activity.amount !== undefined ? (
                              activity.amount.toLocaleString()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                            {/* Total column: show dollar amounts for relevant transaction types */}
                            {(() => {
                              // Dividend: total payout = shares * amount per share (both in cents, amount is stored as total)
                              if (activity.type === 'dividend_payment' && activity.amount) {
                                return `$${(activity.amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              }
                              // Share purchases (investment/mint/share_grant with cost): amount_secondary is cost basis in cents
                              if (['mint', 'share_grant', 'investment'].includes(activity.type) && activity.amountSecondary && activity.amountSecondary > 0) {
                                return `$${(activity.amountSecondary / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              }
                              // Funding round: show target_amount from data
                              if ((activity.type === 'funding_round_create' || activity.type === 'funding_round_close') && activity.data?.target_amount) {
                                return `$${(activity.data.target_amount / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              }
                              return <span className="text-muted-foreground">—</span>
                            })()}
                          </td>
                          <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                            {formatLocalTime(activity.timestamp)}
                          </td>
                          <td className="py-2 px-2">
                            {activity.slot !== undefined && activity.slot !== null ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs font-mono">#{activity.slot.toLocaleString()}</span>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        copySlotToClipboard(activity.slot!)
                                      }}
                                      className="p-0.5 hover:bg-muted rounded"
                                    >
                                      {copiedSlot === activity.slot ? (
                                        <Check className="h-3 w-3 text-green-500" />
                                      ) : (
                                        <Copy className="h-3 w-3 text-muted-foreground" />
                                      )}
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>Copy slot</TooltipContent>
                                </Tooltip>
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <span className={`text-xs ${
                              activity.status === 'success' || activity.status === 'completed'
                                ? 'text-green-600'
                                : activity.status === 'pending'
                                ? 'text-yellow-600'
                                : 'text-red-600'
                            }`}>
                              {activity.status}
                            </span>
                          </td>
                          <td className="py-2 px-2">
                            {activity.slot !== undefined && activity.slot !== null && (
                              <div className="flex items-center justify-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        viewHistoricalSlot(activity.slot!)
                                      }}
                                      className="p-1 hover:bg-muted rounded"
                                    >
                                      <History className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent>View state at this slot</TooltipContent>
                                </Tooltip>
                              </div>
                            )}
                          </td>
                        </tr>
                        {/* Expanded row details */}
                        {expandedRows.has(activity.id) && (
                          <tr className="bg-muted/30">
                            <td colSpan={9} className="py-3 px-4">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                                <div>
                                  <span className="text-muted-foreground">Transaction Type:</span>
                                  <p className="font-medium">{activity.type.replace('_', ' ')}</p>
                                </div>
                                {activity.txSignature && (
                                  <div>
                                    <span className="text-muted-foreground">TX Signature:</span>
                                    <p className="font-mono truncate">{activity.txSignature}</p>
                                  </div>
                                )}
                                {activity.notes && (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Notes:</span>
                                    <p className="font-medium">{activity.notes}</p>
                                  </div>
                                )}
                                {activity.type === 'stock_split' && (
                                  <div>
                                    <span className="text-muted-foreground">Split Ratio:</span>
                                    <p className="font-medium">{activity.splitDenominator}:{activity.splitNumerator}</p>
                                  </div>
                                )}
                                {activity.type === 'convertible_convert' && activity.data && (
                                  <>
                                    <div>
                                      <span className="text-muted-foreground">Instrument:</span>
                                      <p className="font-medium">
                                        {activity.data.convertible_name || activity.data.instrument_type?.toUpperCase() || 'Unknown'}
                                        {activity.data.holder_name && ` (${activity.data.holder_name})`}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Principal Amount:</span>
                                      <p className="font-medium">
                                        ${((activity.data.principal_amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Accrued Amount:</span>
                                      <p className="font-medium">
                                        ${((activity.data.accrued_amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Funding Round:</span>
                                      <p className="font-medium">{activity.data.funding_round_name || 'Unknown'}</p>
                                    </div>
                                    {activity.data.valuation_cap && (
                                      <div>
                                        <span className="text-muted-foreground">Valuation Cap:</span>
                                        <p className="font-medium">
                                          ${(activity.data.valuation_cap / 100).toLocaleString(undefined, { minimumFractionDigits: 0 })}
                                        </p>
                                      </div>
                                    )}
                                    {activity.data.discount_rate != null && (
                                      <div>
                                        <span className="text-muted-foreground">Discount Rate:</span>
                                        <p className="font-medium">{(activity.data.discount_rate * 100).toFixed(0)}%</p>
                                      </div>
                                    )}
                                  </>
                                )}
                                {activity.type === 'vesting_release' && activity.data && (
                                  <>
                                    <div>
                                      <span className="text-muted-foreground">Shares Released:</span>
                                      <p className="font-medium">{activity.amount?.toLocaleString() || 0}</p>
                                    </div>
                                    {activity.data.release_number && (
                                      <div>
                                        <span className="text-muted-foreground">Release Number:</span>
                                        <p className="font-medium">{activity.data.release_number}</p>
                                      </div>
                                    )}
                                    {activity.data.cumulative_released && (
                                      <div>
                                        <span className="text-muted-foreground">Cumulative Released:</span>
                                        <p className="font-medium">{activity.data.cumulative_released.toLocaleString()}</p>
                                      </div>
                                    )}
                                    {activity.data.remaining !== undefined && (
                                      <div>
                                        <span className="text-muted-foreground">Remaining:</span>
                                        <p className="font-medium">{activity.data.remaining.toLocaleString()}</p>
                                      </div>
                                    )}
                                  </>
                                )}
                                {activity.type === 'dividend_payment' && activity.data && (
                                  <>
                                    <div>
                                      <span className="text-muted-foreground">Shares Held:</span>
                                      <p className="font-medium">{activity.data.shares_held?.toLocaleString() || 0}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Amount Per Share:</span>
                                      <p className="font-medium">${((activity.data.amount_per_share || 0) / 100).toFixed(2)}</p>
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Total Payment:</span>
                                      <p className="font-medium">${((activity.amount || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    </div>
                                    {activity.data.payment_token && (
                                      <div>
                                        <span className="text-muted-foreground">Payment Token:</span>
                                        <p className="font-medium">{activity.data.payment_token}</p>
                                      </div>
                                    )}
                                  </>
                                )}
                                {activity.shareClass && (
                                  <div>
                                    <span className="text-muted-foreground">Share Class:</span>
                                    <p className="font-medium">{activity.shareClass}</p>
                                  </div>
                                )}
                                {activity.data && Object.keys(activity.data).length > 0 && !['convertible_convert', 'vesting_release', 'dividend_payment', 'stock_split'].includes(activity.type) && (
                                  <div className="col-span-2">
                                    <span className="text-muted-foreground">Additional Data:</span>
                                    <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-auto">
                                      {JSON.stringify(activity.data, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(currentPage * ITEMS_PER_PAGE, filteredActivity.length)} of {filteredActivity.length}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Prev
                    </Button>
                    <span className="text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TooltipProvider>
          ) : (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">No recent activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
