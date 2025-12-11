'use client'

import { useState, useEffect, useMemo, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, ChevronDown, ChevronUp, Copy, Check, History } from 'lucide-react'
import { WalletAddress } from '@/components/WalletAddress'
import { api, SharePosition, ShareClass, UnifiedTransaction } from '@/lib/api'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/useAppStore'
import { formatDate } from '@/lib/utils'
import { ViewModeToggle, ViewMode } from '@/components/ui/view-mode-toggle'
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

const CHART_COLORS = [
  'hsl(221, 83%, 53%)',   // blue
  'hsl(142, 71%, 45%)',   // green
  'hsl(262, 83%, 58%)',   // purple
  'hsl(24, 94%, 50%)',    // orange
  'hsl(346, 77%, 49%)',   // red
  'hsl(187, 85%, 43%)',   // cyan
  'hsl(45, 93%, 47%)',    // yellow
  'hsl(280, 65%, 60%)',   // violet
  'hsl(160, 60%, 45%)',   // teal
  'hsl(330, 75%, 55%)',   // pink
]

// Helper to format cents as whole dollars (rounded)
const formatDollarsRounded = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

// Helper to format cents as dollars with 2 decimal places
const formatDollarsDetailed = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100)
}

// Transaction types that affect share positions
const SHARE_AFFECTING_TX_TYPES = [
  'mint',
  'share_grant',
  'investment',
  'vesting_release',
  'convertible_convert',
  'transfer',
]

interface SharePositionsProps {
  tokenId: number
  positions: SharePosition[]
  shareClasses: ShareClass[]
  loading?: boolean
  onRefresh?: () => void
  totalShares?: number // Total shares for calculating ownership %
}

export function SharePositions({
  tokenId,
  positions,
  shareClasses,
  loading = false,
  onRefresh,
  totalShares: propTotalShares,
}: SharePositionsProps) {
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  // Calculate total shares from positions if not provided
  const totalShares = propTotalShares ?? positions.reduce((sum, p) => sum + p.shares, 0)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [walletTransactions, setWalletTransactions] = useState<Record<string, UnifiedTransaction[]>>({})
  const [loadingTransactions, setLoadingTransactions] = useState<Set<string>>(new Set())
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)

  // Aggregate positions by wallet for chart views
  const aggregatedByWallet = useMemo(() => {
    const walletMap = new Map<string, { wallet: string; shares: number; cost_basis: number; current_value: number }>()
    positions.forEach((p) => {
      const existing = walletMap.get(p.wallet)
      const currentValue = p.current_value ?? p.cost_basis
      if (existing) {
        existing.shares += p.shares
        existing.cost_basis += p.cost_basis
        existing.current_value += currentValue
      } else {
        walletMap.set(p.wallet, {
          wallet: p.wallet,
          shares: p.shares,
          cost_basis: p.cost_basis,
          current_value: currentValue,
        })
      }
    })
    return Array.from(walletMap.values())
      .sort((a, b) => b.shares - a.shares)
      .map((item, idx) => ({
        ...item,
        pct: totalShares > 0 ? (item.shares / totalShares) * 100 : 0,
        color: CHART_COLORS[idx % CHART_COLORS.length],
        // Truncate wallet for chart display
        name: `${item.wallet.slice(0, 4)}...${item.wallet.slice(-4)}`,
      }))
  }, [positions, totalShares])

  // Clear cached transactions when the selected slot changes
  // This ensures we re-fetch transactions filtered by the new slot
  useMemo(() => {
    setWalletTransactions({})
    setExpandedRows(new Set())
  }, [selectedSlot])

  // Create a wallet-to-color mapping for consistent colors in table view
  const walletColorMap = useMemo(() => {
    const map = new Map<string, string>()
    aggregatedByWallet.forEach((item) => {
      map.set(item.wallet, item.color)
    })
    return map
  }, [aggregatedByWallet])

  const toggleRowExpanded = async (positionKey: string, wallet: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(positionKey)) {
        next.delete(positionKey)
      } else {
        next.add(positionKey)
        // Fetch transactions for this wallet if not already loaded
        if (!walletTransactions[wallet]) {
          fetchWalletTransactions(wallet)
        }
      }
      return next
    })
  }

  const fetchWalletTransactions = async (wallet: string) => {
    setLoadingTransactions(prev => new Set(prev).add(wallet))
    try {
      // Pass selectedSlot as maxSlot to filter transactions to only those at or before the selected slot
      const transactions = await api.getUnifiedTransactions(tokenId, 100, selectedSlot ?? undefined, undefined, wallet)
      // Filter to only share-affecting transactions
      const shareTransactions = transactions.filter(tx =>
        SHARE_AFFECTING_TX_TYPES.includes(tx.tx_type)
      )
      setWalletTransactions(prev => ({
        ...prev,
        [wallet]: shareTransactions,
      }))
    } catch (e) {
      console.error('Failed to fetch wallet transactions:', e)
    } finally {
      setLoadingTransactions(prev => {
        const next = new Set(prev)
        next.delete(wallet)
        return next
      })
    }
  }

  const copySlotToClipboard = (slot: number) => {
    navigator.clipboard.writeText(slot.toString())
    setCopiedSlot(slot)
    setTimeout(() => setCopiedSlot(null), 2000)
  }

  // Get share class name by ID
  const getShareClassName = (shareClassId: number | undefined): string => {
    if (!shareClassId) return 'Unknown'
    const shareClass = shareClasses.find(sc => sc.id === shareClassId)
    return shareClass?.name || 'Unknown'
  }

  // Format transaction type for display
  const formatTxType = (txType: string, tx: UnifiedTransaction): string => {
    switch (txType) {
      case 'mint':
      case 'share_grant':
        // Check if it's a grant (free) or investment (paid)
        return (tx.amount_secondary && tx.amount_secondary > 0) ? 'Investment' : 'Grant'
      case 'investment':
        return 'Investment'
      case 'vesting_release':
        return 'Vesting'
      case 'convertible_convert':
        return 'Conversion'
      case 'transfer':
        return tx.wallet === tx.wallet_to ? 'Transfer In' : 'Transfer Out'
      default:
        return txType.replace('_', ' ')
    }
  }

  // Determine if transaction is inbound or outbound for this wallet
  const isInboundTransaction = (tx: UnifiedTransaction, wallet: string): boolean => {
    if (tx.tx_type === 'transfer') {
      return tx.wallet_to === wallet
    }
    // For grants, investments, vesting, etc., the wallet field is the recipient
    return tx.wallet === wallet || tx.wallet_to === wallet
  }

  // Calculate shares in/out for display
  const getSharesDisplay = (tx: UnifiedTransaction, wallet: string): { shares: number, isPositive: boolean } => {
    const isInbound = tx.tx_type === 'transfer' ? tx.wallet_to === wallet : true
    const shares = tx.amount || 0
    return {
      shares,
      isPositive: isInbound,
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share Positions</CardTitle>
          <CardDescription>All shareholders and their positions across share classes</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  if (positions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Share Positions</CardTitle>
          <CardDescription>All shareholders and their positions across share classes</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No shares have been issued yet
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>Share Positions</CardTitle>
          <CardDescription>All shareholders and their positions across share classes</CardDescription>
        </div>
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
      </CardHeader>
      <CardContent>
        {viewMode === 'pie' ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex-shrink-0 w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPieChart>
                  <Pie
                    data={aggregatedByWallet}
                    dataKey="pct"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {aggregatedByWallet.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null
                      const data = payload[0].payload
                      return (
                        <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
                          <p className="font-medium font-mono text-xs">{data.wallet}</p>
                          <p className="text-muted-foreground">
                            {data.shares.toLocaleString()} shares ({data.pct.toFixed(2)}%)
                          </p>
                          <p className="text-muted-foreground">
                            Value: {formatDollarsRounded(data.current_value)}
                          </p>
                        </div>
                      )
                    }}
                  />
                </RechartsPieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {aggregatedByWallet.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate font-mono text-xs">{item.name}</span>
                  <span className="text-muted-foreground ml-auto">{item.pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        ) : viewMode === 'bar' ? (
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={aggregatedByWallet}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
              >
                <XAxis
                  type="number"
                  domain={[0, 'auto']}
                  tickFormatter={(value) => `${value.toFixed(0)}%`}
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={90}
                  fontSize={11}
                  tickLine={false}
                />
                <RechartsTooltip
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null
                    const data = payload[0].payload
                    return (
                      <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
                        <p className="font-medium font-mono text-xs">{data.wallet}</p>
                        <p className="text-muted-foreground">
                          {data.shares.toLocaleString()} shares ({data.pct.toFixed(2)}%)
                        </p>
                        <p className="text-muted-foreground">
                          Value: {formatDollarsRounded(data.current_value)}
                        </p>
                      </div>
                    )
                  }}
                />
                <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
                  {aggregatedByWallet.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
        <TooltipProvider>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Wallet</th>
                  <th className="text-left py-3 px-4 font-medium">Share Class</th>
                  <th className="text-right py-3 px-4 font-medium">Shares</th>
                  <th className="text-right py-3 px-4 font-medium">Ownership</th>
                  <th className="text-right py-3 px-4 font-medium">Cost</th>
                  <th className="text-right py-3 px-4 font-medium">Current Value</th>
                  <th className="text-right py-3 px-4 font-medium">Liq. Preference</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((position, idx) => {
                  const positionKey = `${position.wallet}-${position.share_class?.id || idx}`
                  const shareClass = position.share_class
                  const preference = position.preference_amount ?? (
                    shareClass
                      ? position.cost_basis * shareClass.preference_multiple
                      : position.cost_basis
                  )
                  const currentValue = position.current_value ?? position.cost_basis
                  const isExpanded = expandedRows.has(positionKey)
                  // Filter transactions to only show those for this specific share class
                  const allWalletTransactions = walletTransactions[position.wallet] || []
                  const transactions = allWalletTransactions.filter(tx =>
                    tx.share_class_id === shareClass?.id
                  )
                  const isLoadingTx = loadingTransactions.has(position.wallet)

                  return (
                    <Fragment key={positionKey}>
                      <tr
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleRowExpanded(positionKey, position.wallet)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full flex-shrink-0"
                              style={{ backgroundColor: walletColorMap.get(position.wallet) || CHART_COLORS[0] }}
                            />
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            <WalletAddress address={position.wallet} />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-xs ${
                            shareClass?.priority === 0 ? 'bg-red-500/10 text-red-500' :
                            (shareClass?.priority ?? 99) < 50 ? 'bg-blue-500/10 text-blue-500' :
                            'bg-gray-500/10 text-gray-500'
                          }`}>
                            {shareClass?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {position.shares.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {totalShares > 0 ? ((position.shares / totalShares) * 100).toFixed(2) : '0.00'}%
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollarsRounded(position.cost_basis)}</div>
                          <div className="text-xs text-muted-foreground">
                            {position.shares > 0
                              ? formatDollarsDetailed(position.cost_basis / position.shares) + '/share'
                              : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollarsRounded(currentValue)}</div>
                          <div className="text-xs text-muted-foreground">
                            {position.shares > 0
                              ? formatDollarsDetailed(currentValue / position.shares) + '/share'
                              : '—'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div>{formatDollarsRounded(preference)}</div>
                          <span className="text-xs text-muted-foreground">
                            ({shareClass?.preference_multiple || 1}x)
                          </span>
                        </td>
                      </tr>

                      {/* Expanded transaction details */}
                      {isExpanded && (
                        <tr className="bg-muted/30">
                          <td colSpan={7} className="py-3 px-4">
                            <div className="space-y-3">
                              <h4 className="font-medium text-sm">Transaction History</h4>
                              {isLoadingTx ? (
                                <div className="flex items-center gap-2 py-4">
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                  <span className="text-sm text-muted-foreground">Loading transactions...</span>
                                </div>
                              ) : transactions.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-2">No transaction history found</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b">
                                        <th className="text-left py-2 px-2 font-medium">Type</th>
                                        <th className="text-left py-2 px-2 font-medium">Share Class</th>
                                        <th className="text-right py-2 px-2 font-medium">Shares In</th>
                                        <th className="text-right py-2 px-2 font-medium">Shares Out</th>
                                        <th className="text-right py-2 px-2 font-medium">Total Paid</th>
                                        <th className="text-left py-2 px-2 font-medium">Date</th>
                                        <th className="text-left py-2 px-2 font-medium">Slot</th>
                                        <th className="text-center py-2 px-2 font-medium">Actions</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {transactions.map(tx => {
                                        const { shares, isPositive } = getSharesDisplay(tx, position.wallet)
                                        const txShareClassName = getShareClassName(tx.share_class_id || undefined)
                                        return (
                                          <tr key={tx.id} className="border-b last:border-0">
                                            <td className="py-2 px-2">
                                              <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                tx.tx_type === 'transfer' && !isPositive
                                                  ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                                  : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                                              }`}>
                                                {formatTxType(tx.tx_type, tx)}
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-muted-foreground">
                                              {txShareClassName}
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium text-green-600">
                                              {isPositive && shares > 0 ? `+${shares.toLocaleString()}` : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium text-red-600">
                                              {!isPositive && shares > 0 ? `-${shares.toLocaleString()}` : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium">
                                              {tx.amount_secondary && tx.amount_secondary > 0
                                                ? formatDollarsRounded(tx.amount_secondary)
                                                : '—'}
                                            </td>
                                            <td className="py-2 px-2 text-muted-foreground text-xs">
                                              {formatDate(tx.created_at)}
                                            </td>
                                            <td className="py-2 px-2">
                                              <div className="flex items-center gap-1">
                                                <span className="text-xs font-mono">#{tx.slot.toLocaleString()}</span>
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        copySlotToClipboard(tx.slot)
                                                      }}
                                                      className="p-0.5 hover:bg-muted rounded"
                                                    >
                                                      {copiedSlot === tx.slot ? (
                                                        <Check className="h-3 w-3 text-green-500" />
                                                      ) : (
                                                        <Copy className="h-3 w-3 text-muted-foreground" />
                                                      )}
                                                    </button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>Copy slot ID</TooltipContent>
                                                </Tooltip>
                                              </div>
                                            </td>
                                            <td className="py-2 px-2">
                                              <div className="flex items-center justify-center">
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <button
                                                      onClick={(e) => {
                                                        e.stopPropagation()
                                                        setSelectedSlot(tx.slot)
                                                      }}
                                                      className="p-1 hover:bg-muted rounded"
                                                    >
                                                      <History className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                                                    </button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>View state at this slot</TooltipContent>
                                                </Tooltip>
                                              </div>
                                            </td>
                                          </tr>
                                        )
                                      })}
                                    </tbody>
                                    <tfoot>
                                      <tr className="border-t font-medium">
                                        <td colSpan={2} className="py-2 px-2">Total</td>
                                        <td className="py-2 px-2 text-right text-green-600">
                                          +{transactions
                                            .filter(tx => getSharesDisplay(tx, position.wallet).isPositive)
                                            .reduce((sum, tx) => sum + (tx.amount || 0), 0)
                                            .toLocaleString()}
                                        </td>
                                        <td className="py-2 px-2 text-right text-red-600">
                                          -{transactions
                                            .filter(tx => !getSharesDisplay(tx, position.wallet).isPositive)
                                            .reduce((sum, tx) => sum + (tx.amount || 0), 0)
                                            .toLocaleString()}
                                        </td>
                                        <td className="py-2 px-2 text-right font-medium">
                                          {formatDollarsRounded(
                                            transactions.reduce((sum, tx) => sum + (tx.amount_secondary || 0), 0)
                                          )}
                                        </td>
                                        <td colSpan={3} className="py-2 px-2 text-right">
                                          <span className="text-muted-foreground">Net: </span>
                                          <span className="font-bold">
                                            {(
                                              transactions.filter(tx => getSharesDisplay(tx, position.wallet).isPositive)
                                                .reduce((sum, tx) => sum + (tx.amount || 0), 0) -
                                              transactions.filter(tx => !getSharesDisplay(tx, position.wallet).isPositive)
                                                .reduce((sum, tx) => sum + (tx.amount || 0), 0)
                                            ).toLocaleString()}
                                          </span>
                                        </td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
        )}
      </CardContent>
    </Card>
  )
}
