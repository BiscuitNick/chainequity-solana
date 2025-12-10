'use client'

import { useEffect, useState, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppStore } from '@/stores/useAppStore'
import api, { CapTableResponse, Proposal, TransferStatsResponse, IssuanceStatsResponse, UnifiedTransaction, ReconstructedState } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
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
}

type ActivityFilter = 'all' | 'transfer' | 'mint' | 'share_grant' | 'approval' | 'other'

const ITEMS_PER_PAGE = 10

export default function DashboardPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [reconstructedState, setReconstructedState] = useState<ReconstructedState | null>(null)
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
  const filteredActivity = activityFilter === 'all'
    ? allActivity
    : activityFilter === 'other'
    ? allActivity.filter(a => !['transfer', 'mint', 'share_grant', 'approval'].includes(a.type))
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
      from = tx.tx_type === 'mint' ? 'MINT' : 'GRANT'
      to = tx.wallet || ''
    } else if (tx.tx_type === 'stock_split') {
      // For stock split, from/to represent the ratio
      from = String(tx.data?.denominator || 1)
      to = String(tx.data?.numerator || 1)
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
          const [currentSlotResponse, transactions, proposalsData] = await Promise.all([
            api.getCurrentSlot().catch(() => ({ slot: 0 })),
            api.getUnifiedTransactions(selectedToken.tokenId, 100).catch(() => []),
            api.getProposals(selectedToken.tokenId, 'active').catch(() => []),
          ])

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

  // Helper to check if a field is relevant for a transaction type
  const isFieldRelevant = (activity: Activity, field: 'from' | 'to' | 'amount') => {
    const type = activity.type
    switch (field) {
      case 'from':
        return ['transfer', 'mint', 'share_grant', 'stock_split'].includes(type)
      case 'to':
        return ['transfer', 'mint', 'share_grant', 'approval', 'revocation', 'stock_split'].includes(type)
      case 'amount':
        return ['transfer', 'mint', 'share_grant', 'burn'].includes(type)
      default:
        return true
    }
  }

  // Format local time
  const formatLocalTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
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
              onClick={() => setSelectedSlot(null)}
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

      <Card>
        <CardHeader>
          <CardTitle>Ownership Distribution</CardTitle>
          <CardDescription>Token holder breakdown</CardDescription>
        </CardHeader>
        <CardContent>
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : capTable && capTable.holders.length > 0 ? (
              <div className="space-y-4">
                {capTable.holders.slice(0, 5).map((holder, idx) => (
                  <div key={holder.wallet} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: `hsl(${idx * 60}, 70%, 50%)` }}
                      />
                      <WalletAddress address={holder.wallet} />
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{holder.ownership_pct.toFixed(2)}%</div>
                      <div className="text-xs text-muted-foreground">
                        {holder.balance.toLocaleString()} shares
                      </div>
                    </div>
                  </div>
                ))}
                {capTable.holders.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center">
                    +{capTable.holders.length - 5} more holders
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No holders yet</p>
              </div>
            )}
        </CardContent>
      </Card>

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
              <option value="all">All Activity</option>
              <option value="transfer">Transfers</option>
              <option value="mint">Mints</option>
              <option value="share_grant">Share Grants</option>
              <option value="approval">Approvals</option>
              <option value="other">Other</option>
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
                                activity.type === 'mint'
                                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                  : activity.type === 'share_grant'
                                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                  : activity.type === 'transfer'
                                  ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                  : activity.type === 'approval'
                                  ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                  : activity.type === 'stock_split'
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                  : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                              }`}>
                                {activity.type === 'mint' ? 'MINT'
                                  : activity.type === 'share_grant' ? 'SHARES'
                                  : activity.type === 'transfer' ? 'TRANSFER'
                                  : activity.type === 'approval' ? 'APPROVAL'
                                  : activity.type === 'stock_split' ? 'SPLIT'
                                  : activity.type.toUpperCase().replace('_', ' ')}
                              </span>
                            </div>
                            {activity.shareClass && (
                              <span className="text-xs text-muted-foreground ml-1">({activity.shareClass})</span>
                            )}
                          </td>
                          <td className="py-2 px-2">
                            {!isFieldRelevant(activity, 'from') ? (
                              <span className="text-muted-foreground">—</span>
                            ) : activity.type === 'stock_split' ? (
                              <span className="font-mono text-xs font-medium">{activity.splitDenominator || activity.from}</span>
                            ) : activity.from === 'MINT' || activity.from === 'GRANT' ? (
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
                            {!isFieldRelevant(activity, 'amount') ? (
                              <span className="text-muted-foreground">—</span>
                            ) : activity.amount !== null && activity.amount !== undefined ? (
                              activity.amount.toLocaleString()
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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
                            <td colSpan={8} className="py-3 px-4">
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
                                {activity.shareClass && (
                                  <div>
                                    <span className="text-muted-foreground">Share Class:</span>
                                    <p className="font-medium">{activity.shareClass}</p>
                                  </div>
                                )}
                                {activity.data && Object.keys(activity.data).length > 0 && (
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
