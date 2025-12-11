'use client'

import { useState, useEffect, Fragment, useMemo, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RefreshCw, ChevronDown, ChevronUp, Copy, Check, History, Clock, Calendar } from 'lucide-react'
import { WalletAddress } from '@/components/WalletAddress'
import { api, VestingSchedule, UnifiedTransaction } from '@/lib/api'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAppStore } from '@/stores/useAppStore'

// Helper to format duration in seconds to human readable
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
  const days = Math.floor(seconds / 86400)
  if (days >= 365) return `${Math.floor(days / 365)}y`
  if (days >= 30) return `${Math.floor(days / 30)}mo`
  return `${days}d`
}

// Format interval for display
const formatInterval = (interval: string) => {
  const labels: Record<string, string> = {
    minute: 'Minute',
    hour: 'Hourly',
    day: 'Daily',
    month: 'Monthly',
  }
  return labels[interval] || interval
}

interface ShareholderVestingProps {
  tokenId: number
  schedules: VestingSchedule[]
  loading?: boolean
  onRefresh?: () => void
  title?: string
  description?: string
}

interface VestingByWallet {
  wallet: string
  schedules: VestingSchedule[]
  totalAmount: number
  vestedAmount: number
}

// Compute released amount from transactions (source of truth)
const computeReleasedFromTransactions = (transactions: UnifiedTransaction[]): number => {
  return transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0)
}

export function ShareholderVesting({
  tokenId,
  schedules,
  loading = false,
  onRefresh,
  title = 'Shareholder Vesting',
  description = 'Shareholders with vesting schedules',
}: ShareholderVestingProps) {
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [walletTransactions, setWalletTransactions] = useState<Record<string, UnifiedTransaction[]>>({})
  const [loadingTransactions, setLoadingTransactions] = useState<Set<string>>(new Set())
  const [copiedSlot, setCopiedSlot] = useState<number | null>(null)

  // Fetch transactions for a wallet - wrapped in useCallback since it's used in useEffect
  const fetchWalletTransactions = useCallback(async (wallet: string, slotFilter?: number | null) => {
    setLoadingTransactions(prev => new Set(prev).add(wallet))
    try {
      // Pass slotFilter as maxSlot to filter transactions to only those at or before the selected slot
      const transactions = await api.getUnifiedTransactions(tokenId, 100, slotFilter ?? undefined, 'vesting_release', wallet)
      setWalletTransactions(prev => ({
        ...prev,
        [wallet]: transactions,
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
  }, [tokenId])

  // When selected slot changes, clear cached transactions and re-fetch for all wallets
  // This ensures historical view shows correct data immediately
  useEffect(() => {
    setWalletTransactions({})

    // In historical view, auto-fetch transactions for all wallets to show correct vested/released amounts
    if (selectedSlot && schedules.length > 0) {
      const uniqueWallets = [...new Set(schedules.map(s => s.beneficiary))]
      uniqueWallets.forEach(wallet => {
        fetchWalletTransactions(wallet, selectedSlot)
      })
    }
  }, [selectedSlot, schedules, fetchWalletTransactions])

  // Group schedules by wallet
  const vestingByWallet: VestingByWallet[] = schedules.reduce((acc: VestingByWallet[], schedule) => {
    const existing = acc.find(v => v.wallet === schedule.beneficiary)
    if (existing) {
      existing.schedules.push(schedule)
      existing.totalAmount += schedule.total_amount
      existing.vestedAmount += schedule.vested_amount
    } else {
      acc.push({
        wallet: schedule.beneficiary,
        schedules: [schedule],
        totalAmount: schedule.total_amount,
        vestedAmount: schedule.vested_amount,
      })
    }
    return acc
  }, [])

  // Sort by total amount descending
  vestingByWallet.sort((a, b) => b.totalAmount - a.totalAmount)

  const toggleRowExpanded = async (wallet: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(wallet)) {
        next.delete(wallet)
      } else {
        next.add(wallet)
        // Fetch vesting release transactions for this wallet if not already loaded
        if (!walletTransactions[wallet]) {
          fetchWalletTransactions(wallet, selectedSlot)
        }
      }
      return next
    })
  }

  const copySlotToClipboard = (slot: number) => {
    navigator.clipboard.writeText(slot.toString())
    setCopiedSlot(slot)
    setTimeout(() => setCopiedSlot(null), 2000)
  }

  // Calculate remaining time until fully vested
  const getRemainingTime = (schedule: VestingSchedule) => {
    const now = Date.now()
    const startTime = new Date(schedule.start_time).getTime()
    const endTime = startTime + schedule.total_duration * 1000

    if (schedule.is_terminated) return 'Terminated'
    if (now >= endTime) return 'Fully vested'
    if (now < startTime) {
      const remainingSeconds = Math.ceil((endTime - startTime) / 1000)
      return formatDuration(remainingSeconds)
    }

    const remainingMs = endTime - now
    const remainingSeconds = Math.ceil(remainingMs / 1000)
    return formatDuration(remainingSeconds)
  }

  // Calculate vesting progress percentage
  const getVestingProgress = (schedule: VestingSchedule) => {
    if (schedule.total_amount === 0) return 0
    return (schedule.vested_amount / schedule.total_amount) * 100
  }

  // Get status badge color - use vested_amount for completion check (more reliable than released_amount)
  const getStatusColor = (schedule: VestingSchedule) => {
    if (schedule.is_terminated) return 'bg-red-500/10 text-red-500'
    if (schedule.vested_amount >= schedule.total_amount) return 'bg-blue-500/10 text-blue-500'
    return 'bg-green-500/10 text-green-500'
  }

  // Get status text - use vested_amount for completion check (more reliable than released_amount)
  const getStatusText = (schedule: VestingSchedule) => {
    if (schedule.is_terminated) return 'terminated'
    if (schedule.vested_amount >= schedule.total_amount) return 'completed'
    return 'active'
  }

  // Check if this is a short duration schedule (less than 1 day)
  const isShortDuration = (schedule: VestingSchedule) => {
    return schedule.total_duration < 86400
  }

  // Format date/time based on duration scale
  const formatDateTime = (dateStr: string, shortDuration: boolean) => {
    const date = new Date(dateStr)
    if (shortDuration) {
      return date.toLocaleString()
    }
    return date.toLocaleDateString()
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-8">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    )
  }

  // Filter to only show wallets with vesting (at least one schedule)
  const walletsWithVesting = vestingByWallet.filter(v => v.schedules.length > 0)

  if (walletsWithVesting.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">
            No vesting schedules found
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <TooltipProvider>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Wallet</th>
                  <th className="text-right py-3 px-4 font-medium">Total Shares</th>
                  <th className="text-right py-3 px-4 font-medium">Vested</th>
                  <th className="text-right py-3 px-4 font-medium">Unvested</th>
                  <th className="text-right py-3 px-4 font-medium">% Vested</th>
                  <th className="text-center py-3 px-4 font-medium">Schedules</th>
                </tr>
              </thead>
              <tbody>
                {walletsWithVesting.map((walletVesting) => {
                  const { wallet, schedules: walletSchedules, totalAmount, vestedAmount } = walletVesting
                  const isExpanded = expandedRows.has(wallet)
                  const transactions = walletTransactions[wallet] || []
                  const isLoadingTx = loadingTransactions.has(wallet)

                  // For historical view (selectedSlot), vested amount equals released amount
                  // since vested tokens are immediately released in interval-based vesting.
                  // For live view, use the schedule's vested_amount.
                  const historicalVestedAmount = transactions.length > 0
                    ? computeReleasedFromTransactions(transactions)
                    : vestedAmount
                  const displayVestedAmount = selectedSlot ? historicalVestedAmount : vestedAmount

                  const unvestedAmount = totalAmount - displayVestedAmount
                  const vestedPercent = totalAmount > 0 ? (displayVestedAmount / totalAmount) * 100 : 0

                  // Separate current (active) and past (completed/terminated) schedules
                  // Use vested_amount for completion check (more reliable than released_amount)
                  const currentSchedules = walletSchedules.filter(s => !s.is_terminated && s.vested_amount < s.total_amount)
                  const pastSchedules = walletSchedules.filter(s => s.is_terminated || s.vested_amount >= s.total_amount)

                  return (
                    <Fragment key={wallet}>
                      <tr
                        className="border-b hover:bg-muted/50 cursor-pointer"
                        onClick={() => toggleRowExpanded(wallet)}
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronUp className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            )}
                            <WalletAddress address={wallet} />
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right font-medium">
                          {totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-blue-500">
                          {displayVestedAmount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right text-yellow-500">
                          {unvestedAmount.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {vestedPercent.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded text-xs bg-purple-500/10 text-purple-500">
                            {walletSchedules.length}
                          </span>
                        </td>
                      </tr>

                      {/* Expanded vesting details */}
                      {isExpanded && (
                        <tr className="bg-muted/30">
                          <td colSpan={6} className="py-4 px-4">
                            <div className="space-y-6">
                              {/* Current Vesting Schedules */}
                              {currentSchedules.length > 0 && (
                                <div>
                                  <h4 className="font-medium text-sm mb-3">Current Vesting Schedules</h4>
                                  <div className="space-y-3">
                                    {currentSchedules.map((schedule) => {
                                      const shortDuration = isShortDuration(schedule)
                                      const progress = getVestingProgress(schedule)
                                      const startDate = new Date(schedule.start_time)
                                      const cliffEnd = new Date(startDate.getTime() + schedule.cliff_duration * 1000)
                                      const vestingEnd = new Date(startDate.getTime() + schedule.total_duration * 1000)

                                      return (
                                        <div key={schedule.id} className="border rounded-lg p-3 bg-background">
                                          <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(schedule)}`}>
                                                {getStatusText(schedule)}
                                              </span>
                                              <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs">
                                                {formatInterval(schedule.interval)}
                                              </span>
                                              <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                                                {schedule.intervals_released}/{schedule.total_intervals} intervals
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <div className="font-medium">
                                                {schedule.vested_amount.toLocaleString()} / {schedule.total_amount.toLocaleString()}
                                              </div>
                                              <div className="text-xs text-muted-foreground">
                                                {schedule.released_amount.toLocaleString()} released
                                              </div>
                                            </div>
                                          </div>

                                          {/* Schedule details grid */}
                                          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm mb-2">
                                            <div>
                                              <span className="text-muted-foreground text-xs">Start</span>
                                              <div className="font-medium text-xs">{formatDateTime(schedule.start_time, shortDuration)}</div>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground text-xs">Cliff</span>
                                              <div className="font-medium text-xs">
                                                {schedule.cliff_duration > 0 ? formatDuration(schedule.cliff_duration) : 'None'}
                                              </div>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground text-xs">Duration</span>
                                              <div className="font-medium text-xs">{formatDuration(schedule.total_duration)}</div>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground text-xs">Per Interval</span>
                                              <div className="font-medium text-xs">{schedule.amount_per_interval.toLocaleString()}</div>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground text-xs">Remaining</span>
                                              <div className="font-medium text-xs">{getRemainingTime(schedule)}</div>
                                            </div>
                                            <div>
                                              <span className="text-muted-foreground text-xs">End Date</span>
                                              <div className="font-medium text-xs">{formatDateTime(vestingEnd.toISOString(), shortDuration)}</div>
                                            </div>
                                          </div>

                                          {/* Progress bar */}
                                          <div className="w-full bg-muted rounded-full h-1.5">
                                            <div
                                              className="bg-primary h-1.5 rounded-full transition-all"
                                              style={{ width: `${progress}%` }}
                                            />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Past Vesting Schedules */}
                              {pastSchedules.length > 0 && (
                                <div>
                                  <h4 className="font-medium text-sm mb-3 text-muted-foreground">Past Vesting Schedules</h4>
                                  <div className="space-y-2">
                                    {pastSchedules.map((schedule) => {
                                      const shortDuration = isShortDuration(schedule)
                                      return (
                                        <div key={schedule.id} className="border rounded-lg p-2 bg-muted/20 opacity-75">
                                          <div className="flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-2">
                                              <span className={`px-2 py-0.5 rounded text-xs capitalize ${getStatusColor(schedule)}`}>
                                                {getStatusText(schedule)}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {formatInterval(schedule.interval)}
                                              </span>
                                              <span className="text-xs text-muted-foreground">
                                                {schedule.intervals_released}/{schedule.total_intervals}
                                              </span>
                                            </div>
                                            <div className="text-right">
                                              <span className="font-medium">
                                                {schedule.released_amount.toLocaleString()} / {schedule.total_amount.toLocaleString()}
                                              </span>
                                              <span className="text-xs text-muted-foreground ml-2">
                                                ({formatDateTime(schedule.start_time, shortDuration)})
                                              </span>
                                            </div>
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Vesting Release Transactions */}
                              <div>
                                <h4 className="font-medium text-sm mb-3">Vesting Release Transactions</h4>
                                {isLoadingTx ? (
                                  <div className="flex items-center gap-2 py-4">
                                    <RefreshCw className="h-4 w-4 animate-spin" />
                                    <span className="text-sm text-muted-foreground">Loading transactions...</span>
                                  </div>
                                ) : transactions.length === 0 ? (
                                  <p className="text-sm text-muted-foreground py-2">No vesting releases yet</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                      <thead>
                                        <tr className="border-b">
                                          <th className="text-left py-2 px-2 font-medium">Type</th>
                                          <th className="text-right py-2 px-2 font-medium">Shares Released</th>
                                          <th className="text-left py-2 px-2 font-medium">Date</th>
                                          <th className="text-left py-2 px-2 font-medium">Slot</th>
                                          <th className="text-center py-2 px-2 font-medium">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {transactions.map(tx => (
                                          <tr key={tx.id} className="border-b last:border-0">
                                            <td className="py-2 px-2">
                                              <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                Vesting Release
                                              </span>
                                            </td>
                                            <td className="py-2 px-2 text-right font-medium text-green-600">
                                              +{(tx.amount || 0).toLocaleString()}
                                            </td>
                                            <td className="py-2 px-2 text-muted-foreground text-xs">
                                              {new Date(tx.created_at).toLocaleString()}
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
                                        ))}
                                      </tbody>
                                      <tfoot>
                                        <tr className="border-t font-medium">
                                          <td className="py-2 px-2">Total Released</td>
                                          <td className="py-2 px-2 text-right text-green-600">
                                            +{transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0).toLocaleString()}
                                          </td>
                                          <td colSpan={3} className="py-2 px-2 text-right text-xs text-muted-foreground">
                                            {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  </div>
                                )}
                              </div>
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
      </CardContent>
    </Card>
  )
}
