'use client'

import { useState, useMemo, Fragment } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table2, PieChart as PieChartIcon, BarChart3, ChevronDown, ChevronUp, RefreshCw, Copy, Check, History } from 'lucide-react'
import { WalletAddress } from '@/components/WalletAddress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { api, UnifiedTransaction } from '@/lib/api'
import { useAppStore } from '@/stores/useAppStore'
import { formatDate } from '@/lib/utils'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts'

export interface Holder {
  wallet: string
  balance: number
  ownership_pct: number
  cost_basis?: number // Total amount paid for shares (in cents)
}

interface OwnershipDistributionProps {
  holders: Holder[]
  loading?: boolean
  title?: string
  description?: string
  pricePerShare?: number // In cents
  tokenId?: number // Required for fetching transactions
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
  'hsl(210, 20%, 50%)',   // gray for Others
]

type ViewMode = 'table' | 'pie' | 'bar'

function truncateWallet(wallet: string, isOthers: boolean): string {
  if (isOthers) return wallet
  return `${wallet.slice(0, 8)}...${wallet.slice(-4)}`
}

// Helper to format cents as whole dollars (rounded)
const formatDollarsRounded = (cents: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(cents / 100))
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      wallet: string
      balance: number
      ownership_pct: number
      isOthers: boolean
      totalValue?: number
      costBasis?: number
    }
  }>
  pricePerShare?: number
}

function CustomTooltip({ active, payload, pricePerShare }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  return (
    <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
      <p className="font-medium">{truncateWallet(data.wallet, data.isOthers)}</p>
      <p className="text-muted-foreground">
        {data.balance.toLocaleString()} shares ({data.ownership_pct.toFixed(2)}%)
      </p>
      {pricePerShare !== undefined && pricePerShare > 0 && (
        <p className="text-muted-foreground">
          Total: {formatDollarsRounded(data.balance * pricePerShare)}
        </p>
      )}
    </div>
  )
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

// Calculate shares in/out for display
const getSharesDisplay = (tx: UnifiedTransaction, wallet: string): { shares: number, isPositive: boolean } => {
  const isInbound = tx.tx_type === 'transfer' ? tx.wallet_to === wallet : true
  const shares = tx.amount || 0
  return {
    shares,
    isPositive: isInbound,
  }
}

export function OwnershipDistribution({
  holders,
  loading = false,
  title = 'Ownership Distribution',
  description = 'Top shareholders by ownership',
  pricePerShare,
  tokenId,
}: OwnershipDistributionProps) {
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [walletTransactions, setWalletTransactions] = useState<Record<string, UnifiedTransaction[]>>({})
  const [loadingTransactions, setLoadingTransactions] = useState<Set<string>>(new Set())
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)

  // Clear cached transactions when the selected slot changes
  // This ensures we re-fetch transactions filtered by the new slot
  useMemo(() => {
    setWalletTransactions({})
    setExpandedRows(new Set())
  }, [selectedSlot])

  const toggleRowExpanded = async (wallet: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(wallet)) {
        next.delete(wallet)
      } else {
        next.add(wallet)
        // Fetch transactions for this wallet if not already loaded
        if (!walletTransactions[wallet] && tokenId !== undefined) {
          fetchWalletTransactions(wallet)
        }
      }
      return next
    })
  }

  const fetchWalletTransactions = async (wallet: string) => {
    if (tokenId === undefined) return
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

  // Process holders: top 10 + Others
  const processedData = useMemo(() => {
    if (!holders || holders.length === 0) return []

    const sortedHolders = [...holders].sort((a, b) => b.ownership_pct - a.ownership_pct)
    const top10 = sortedHolders.slice(0, 10)
    const others = sortedHolders.slice(10)

    const result = top10.map((h, idx) => ({
      wallet: h.wallet,
      balance: h.balance,
      ownership_pct: h.ownership_pct,
      color: CHART_COLORS[idx],
      isOthers: false,
      name: truncateWallet(h.wallet, false),
      totalValue: pricePerShare ? h.balance * pricePerShare : undefined,
      costBasis: h.cost_basis,
    }))

    if (others.length > 0) {
      const othersTotal = others.reduce((sum, h) => sum + h.balance, 0)
      const othersPct = others.reduce((sum, h) => sum + h.ownership_pct, 0)
      const othersCostBasis = others.reduce((sum, h) => sum + (h.cost_basis || 0), 0)
      const othersName = `Others (${others.length})`
      result.push({
        wallet: othersName,
        balance: othersTotal,
        ownership_pct: othersPct,
        color: CHART_COLORS[10],
        isOthers: true,
        name: othersName,
        totalValue: pricePerShare ? othersTotal * pricePerShare : undefined,
        costBasis: othersCostBasis > 0 ? othersCostBasis : undefined,
      })
    }

    return result
  }, [holders, pricePerShare])

  const showTotalColumn = pricePerShare !== undefined && pricePerShare > 0
  const hasCostData = holders.some(h => h.cost_basis !== undefined && h.cost_basis > 0)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <div className="flex items-center gap-1 bg-muted rounded-md p-1">
          <Button
            variant={viewMode === 'table' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('table')}
            aria-label="Table view"
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'pie' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('pie')}
            aria-label="Pie chart view"
          >
            <PieChartIcon className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'bar' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('bar')}
            aria-label="Bar chart view"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">Loading...</p>
          </div>
        ) : processedData.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <p className="text-muted-foreground">No holders yet</p>
          </div>
        ) : viewMode === 'table' ? (
          <TooltipProvider>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Shareholder</th>
                    <th className="text-right py-3 px-4 font-medium">Shares</th>
                    <th className="text-right py-3 px-4 font-medium">% Owned</th>
                    {hasCostData && (
                      <>
                        <th className="text-right py-3 px-4 font-medium">Total Paid</th>
                        <th className="text-right py-3 px-4 font-medium">Cost/Share</th>
                      </>
                    )}
                    {showTotalColumn && (
                      <th className="text-right py-3 px-4 font-medium">Current Value</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {processedData.map((item, idx) => {
                    const isExpanded = expandedRows.has(item.wallet)
                    const transactions = walletTransactions[item.wallet] || []
                    const isLoadingTx = loadingTransactions.has(item.wallet)
                    const canExpand = !item.isOthers && tokenId !== undefined

                    return (
                      <Fragment key={idx}>
                        <tr
                          className={`border-b hover:bg-muted/50 ${canExpand ? 'cursor-pointer' : ''}`}
                          onClick={() => canExpand && toggleRowExpanded(item.wallet)}
                        >
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1">
                              {canExpand ? (
                                isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )
                              ) : (
                                <div className="w-4" />
                              )}
                              <div
                                className="w-3 h-3 rounded-full flex-shrink-0"
                                style={{ backgroundColor: item.color }}
                              />
                              {item.isOthers ? (
                                <span className="text-muted-foreground">{item.wallet}</span>
                              ) : (
                                <WalletAddress address={item.wallet} />
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-medium">
                            {item.balance.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {item.ownership_pct.toFixed(2)}%
                          </td>
                          {hasCostData && (
                            <>
                              <td className="py-3 px-4 text-right font-medium">
                                {item.costBasis !== undefined && item.costBasis > 0 ? formatDollarsRounded(item.costBasis) : '—'}
                              </td>
                              <td className="py-3 px-4 text-right text-muted-foreground">
                                {item.costBasis !== undefined && item.costBasis > 0 && item.balance > 0
                                  ? formatDollarsRounded(item.costBasis / item.balance)
                                  : '—'}
                              </td>
                            </>
                          )}
                          {showTotalColumn && (
                            <td className="py-3 px-4 text-right font-medium">
                              {item.totalValue !== undefined ? formatDollarsRounded(item.totalValue) : '—'}
                            </td>
                          )}
                        </tr>

                        {/* Expanded transaction details */}
                        {isExpanded && !item.isOthers && (
                          <tr className="bg-muted/30">
                            <td colSpan={3 + (hasCostData ? 2 : 0) + (showTotalColumn ? 1 : 0)} className="py-3 px-4">
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
                                          const { shares, isPositive } = getSharesDisplay(tx, item.wallet)
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
                                          <td className="py-2 px-2">Total</td>
                                          <td className="py-2 px-2 text-right text-green-600">
                                            +{transactions
                                              .filter(tx => getSharesDisplay(tx, item.wallet).isPositive)
                                              .reduce((sum, tx) => sum + (tx.amount || 0), 0)
                                              .toLocaleString()}
                                          </td>
                                          <td className="py-2 px-2 text-right text-red-600">
                                            -{transactions
                                              .filter(tx => !getSharesDisplay(tx, item.wallet).isPositive)
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
                                                transactions.filter(tx => getSharesDisplay(tx, item.wallet).isPositive)
                                                  .reduce((sum, tx) => sum + (tx.amount || 0), 0) -
                                                transactions.filter(tx => !getSharesDisplay(tx, item.wallet).isPositive)
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
        ) : viewMode === 'pie' ? (
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Pie Chart */}
            <div className="flex-shrink-0 w-[200px] h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={processedData}
                    dataKey="ownership_pct"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    strokeWidth={2}
                    stroke="hsl(var(--background))"
                  >
                    {processedData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip pricePerShare={pricePerShare} />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            {/* Legend */}
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {processedData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="truncate">
                    {truncateWallet(item.wallet, item.isOthers)}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {item.ownership_pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Bar Chart */
          <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={processedData}
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
                <RechartsTooltip content={<CustomTooltip pricePerShare={pricePerShare} />} />
                <Bar dataKey="ownership_pct" radius={[0, 4, 4, 0]}>
                  {processedData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
