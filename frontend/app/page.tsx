'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useAppStore } from '@/stores/useAppStore'
import api, { CapTableResponse, Proposal, TransferStatsResponse, IssuanceStatsResponse, CapTableSnapshotV2Detail, UnifiedTransaction } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
import { AlertTriangle, Copy, History, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

// Combined activity type for displaying all unified transactions
type Activity = {
  id: string
  type: string  // tx_type from unified transactions
  from: string
  to: string
  amount: number
  timestamp: string
  status: string
  slot?: number
  shareClass?: string  // For share grants
  txSignature?: string
}

type ActivityFilter = 'all' | 'transfer' | 'mint' | 'share_grant' | 'approval' | 'other'

const ITEMS_PER_PAGE = 10

export default function DashboardPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [historicalSnapshot, setHistoricalSnapshot] = useState<CapTableSnapshotV2Detail | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [transferStats, setTransferStats] = useState<TransferStatsResponse | null>(null)
  const [issuanceStats, setIssuanceStats] = useState<IssuanceStatsResponse | null>(null)
  const [allActivity, setAllActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)

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

  // Helper function to convert unified transaction to Activity
  const convertTransactionToActivity = (tx: UnifiedTransaction): Activity => {
    // Determine 'from' based on transaction type
    let from = tx.wallet || ''
    if (tx.tx_type === 'mint' || tx.tx_type === 'share_grant') {
      from = tx.tx_type === 'mint' ? 'MINT' : 'GRANT'
    }

    return {
      id: `tx-${tx.id}`,
      type: tx.tx_type,
      from,
      to: tx.wallet_to || tx.wallet || '',
      amount: tx.amount || 0,
      timestamp: tx.created_at,
      status: 'completed',
      slot: tx.slot,
      shareClass: tx.data?.share_class_symbol || tx.data?.share_class_name,
      txSignature: tx.tx_signature || undefined,
    }
  }

  useEffect(() => {
    if (selectedToken?.tokenId === undefined || selectedToken?.tokenId === null) return

    const fetchData = async () => {
      setLoading(true)
      setHistoricalSnapshot(null)
      try {
        if (isViewingHistorical && selectedSlot !== null) {
          // Use V2 snapshot API for historical data + fetch unified transactions up to that slot
          const [snapshot, transactions] = await Promise.all([
            api.getCapTableSnapshotV2AtSlot(selectedToken.tokenId, selectedSlot),
            api.getUnifiedTransactions(selectedToken.tokenId, 100, selectedSlot).catch(() => []),
          ])
          setHistoricalSnapshot(snapshot)

          // Convert snapshot to CapTableResponse format for display
          const snapshotHolders = snapshot.holders || []

          const capTableFromSnapshot: CapTableResponse = {
            slot: snapshot.slot,
            timestamp: snapshot.timestamp || new Date().toISOString(),
            total_supply: snapshot.total_supply,
            holder_count: snapshotHolders.length,
            holders: snapshotHolders.map((h: any) => ({
              wallet: h.wallet,
              balance: h.balance,
              ownership_pct: snapshot.total_supply > 0 ? (h.balance / snapshot.total_supply) * 100 : 0,
              vested: 0,
              unvested: 0,
              status: h.status || 'active',
            })),
          }
          setCapTable(capTableFromSnapshot)
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
          // Live data - use current cap table and unified transactions
          const [capTableData, proposalsData, transferStatsData, issuanceStatsData, transactions] = await Promise.all([
            api.getCapTable(selectedToken.tokenId),
            api.getProposals(selectedToken.tokenId, 'active').catch(() => []),
            api.getTransferStats(selectedToken.tokenId).catch(() => null),
            api.getIssuanceStats(selectedToken.tokenId).catch(() => null),
            api.getUnifiedTransactions(selectedToken.tokenId, 100).catch(() => []),
          ])
          setCapTable(capTableData)
          setProposals(proposalsData)
          setTransferStats(transferStatsData)
          setIssuanceStats(issuanceStatsData)

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

  return (
    <div className="space-y-6">
      {isViewingHistorical && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-700 dark:text-amber-400">
              Viewing historical data from snapshot at slot #{historicalSnapshot?.slot?.toLocaleString() || selectedSlot?.toLocaleString()}
              {historicalSnapshot && historicalSnapshot.slot !== selectedSlot && (
                <span className="text-xs ml-2">(nearest to requested slot #{selectedSlot?.toLocaleString()})</span>
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
            <p className="text-xs text-muted-foreground">tokens</p>
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
                        {holder.balance.toLocaleString()} tokens
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
                      <th className="text-right py-2 px-2 font-medium">Amount</th>
                      <th className="text-left py-2 px-2 font-medium">Date & Time</th>
                      <th className="text-left py-2 px-2 font-medium">Slot</th>
                      <th className="text-center py-2 px-2 font-medium">Status</th>
                      <th className="text-center py-2 px-2 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedActivity.map((activity) => (
                      <tr key={activity.id} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-2 px-2">
                          <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                            activity.type === 'mint'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : activity.type === 'share_grant'
                              ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              : activity.type === 'transfer'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                              : activity.type === 'approval'
                              ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400'
                          }`}>
                            {activity.type === 'mint' ? 'MINT'
                              : activity.type === 'share_grant' ? 'SHARES'
                              : activity.type === 'transfer' ? 'TRANSFER'
                              : activity.type === 'approval' ? 'APPROVAL'
                              : activity.type.toUpperCase()}
                          </span>
                          {activity.shareClass && (
                            <span className="text-xs text-muted-foreground ml-1">({activity.shareClass})</span>
                          )}
                        </td>
                        <td className="py-2 px-2">
                          {activity.from === 'MINT' || activity.from === 'GRANT' ? (
                            <span className="font-mono text-xs">{activity.from}</span>
                          ) : (
                            <WalletAddress address={activity.from} />
                          )}
                        </td>
                        <td className="py-2 px-2">
                          <WalletAddress address={activity.to} />
                        </td>
                        <td className="py-2 px-2 text-right font-medium whitespace-nowrap">
                          {activity.amount.toLocaleString()}
                          {activity.type === 'share_grant' && <span className="text-xs ml-1 text-muted-foreground">shares</span>}
                        </td>
                        <td className="py-2 px-2 text-xs text-muted-foreground whitespace-nowrap">
                          {new Date(activity.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 px-2">
                          {activity.slot !== undefined && activity.slot !== null ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs font-mono">#{activity.slot.toLocaleString()}</span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={() => copySlotToClipboard(activity.slot!)}
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
                                    onClick={() => viewHistoricalSlot(activity.slot!)}
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
