'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Download, RefreshCw, AlertTriangle } from 'lucide-react'
import { api, CapTableResponse, ReconstructedState, EnhancedCapTableResponse, EnhancedCapTableByWalletResponse, VestingSchedule } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
import { OwnershipDistribution } from '@/components/OwnershipDistribution'
import { ShareholderVesting } from '@/components/ShareholderVesting'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function CapTablePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [reconstructedState, setReconstructedState] = useState<ReconstructedState | null>(null)
  const [enhancedCapTable, setEnhancedCapTable] = useState<EnhancedCapTableResponse | null>(null)
  const [enhancedCapTableByWallet, setEnhancedCapTableByWallet] = useState<EnhancedCapTableByWalletResponse | null>(null)
  const [vestingSchedules, setVestingSchedules] = useState<VestingSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isViewingHistorical = selectedSlot !== null

  const fetchCapTable = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    setReconstructedState(null)
    try {
      if (isViewingHistorical && selectedSlot !== null) {
        // Use on-the-fly state reconstruction from transactions
        const state = await api.getReconstructedStateAtSlot(selectedToken.tokenId, selectedSlot)
        setReconstructedState(state)

        // Build vesting data map: wallet -> { vested, unvested }
        const vestingByWallet: Record<string, { vested: number; unvested: number }> = {}
        for (const vs of state.vesting_schedules || []) {
          if (!vestingByWallet[vs.beneficiary]) {
            vestingByWallet[vs.beneficiary] = { vested: 0, unvested: 0 }
          }
          vestingByWallet[vs.beneficiary].vested += vs.released_amount
          vestingByWallet[vs.beneficiary].unvested += (vs.total_amount - vs.released_amount)
        }

        // Build holders from reconstructed state balances
        const holders = Object.entries(state.balances)
          .filter(([_, balance]) => balance > 0)
          .map(([wallet, balance]) => {
            const vestingInfo = vestingByWallet[wallet] || { vested: 0, unvested: 0 }
            return {
              wallet,
              balance,
              ownership_pct: state.total_supply > 0 ? (balance / state.total_supply) * 100 : 0,
              vested: vestingInfo.vested,
              unvested: vestingInfo.unvested,
              // Default to 'active' for holders with balance; 'pending' only if explicitly not approved AND no balance
              status: 'active' as const,
            }
          })
          .sort((a, b) => b.balance - a.balance)

        const capTableFromState: CapTableResponse = {
          slot: state.slot,
          timestamp: new Date().toISOString(),
          total_supply: state.total_supply,
          holder_count: holders.length,
          holders,
        }
        setCapTable(capTableFromState)
      } else {
        // Live data - use transaction-based state reconstruction for consistency
        const currentSlotResponse = await api.getCurrentSlot().catch(() => ({ slot: 0 }))
        const currentSlot = currentSlotResponse.slot || 0

        if (currentSlot > 0) {
          // Reconstruct state at current slot
          const state = await api.getReconstructedStateAtSlot(selectedToken.tokenId, currentSlot).catch(() => null)
          if (state) {
            setReconstructedState(state)

            // Build vesting data map: wallet -> { vested, unvested }
            const vestingByWallet: Record<string, { vested: number; unvested: number }> = {}
            for (const vs of state.vesting_schedules || []) {
              if (!vestingByWallet[vs.beneficiary]) {
                vestingByWallet[vs.beneficiary] = { vested: 0, unvested: 0 }
              }
              vestingByWallet[vs.beneficiary].vested += vs.released_amount
              vestingByWallet[vs.beneficiary].unvested += (vs.total_amount - vs.released_amount)
            }

            // Build holders from reconstructed state balances
            const holders = Object.entries(state.balances)
              .filter(([_, balance]) => balance > 0)
              .map(([wallet, balance]) => {
                const vestingInfo = vestingByWallet[wallet] || { vested: 0, unvested: 0 }
                return {
                  wallet,
                  balance,
                  ownership_pct: state.total_supply > 0 ? (balance / state.total_supply) * 100 : 0,
                  vested: vestingInfo.vested,
                  unvested: vestingInfo.unvested,
                  // Default to 'active' for holders with balance
                  status: 'active' as const,
                }
              })
              .sort((a, b) => b.balance - a.balance)

            const capTableFromState: CapTableResponse = {
              slot: state.slot,
              timestamp: new Date().toISOString(),
              total_supply: state.total_supply,
              holder_count: holders.length,
              holders,
            }
            setCapTable(capTableFromState)
          } else {
            // Fallback to API cap table if reconstruction fails
            const data = await api.getCapTable(selectedToken.tokenId)
            setCapTable(data)
          }
        } else {
          // Fallback to API cap table if no slot available
          const data = await api.getCapTable(selectedToken.tokenId)
          setCapTable(data)
        }
      }
      // Also fetch enhanced cap table for price info (for live data only)
      if (!isViewingHistorical) {
        const [enhancedData, enhancedByWalletData, vestingData] = await Promise.all([
          api.getEnhancedCapTable(selectedToken.tokenId).catch(() => null),
          api.getEnhancedCapTableByWallet(selectedToken.tokenId).catch(() => null),
          api.getVestingSchedules(selectedToken.tokenId).catch(() => []),
        ])
        setEnhancedCapTable(enhancedData)
        setEnhancedCapTableByWallet(enhancedByWalletData)
        setVestingSchedules(vestingData)
      } else {
        setEnhancedCapTable(null)
        setEnhancedCapTableByWallet(null)
        // For historical view, don't set vesting schedules here - we'll derive them from reconstructed state
        // The vesting schedules will be computed from reconstructedState.vesting_schedules in the render
      }
    } catch (e: any) {
      console.error('Failed to fetch cap table:', e)
      setError(e.detail || 'Failed to fetch cap table')
      setCapTable(null)
    } finally {
      setLoading(false)
    }
  }

  const handleExport = async () => {
    if (!selectedToken) return
    try {
      const blob = await api.exportCapTable(selectedToken.tokenId, 'csv')
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${selectedToken.symbol}-captable.csv`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (e: any) {
      console.error('Failed to export cap table:', e)
      setError(e.detail || 'Failed to export cap table')
    }
  }

  useEffect(() => {
    fetchCapTable()
  }, [selectedToken, selectedSlot])

  const holders = capTable?.holders || []
  const totalSupply = capTable?.total_supply || 0
  const holderCount = capTable?.holder_count || 0

  // Build holders with cost_basis from enhanced cap table by wallet
  const holdersWithCostBasis = useMemo(() => {
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
  }, [holders, enhancedCapTableByWallet?.wallets])

  // Convert reconstructed state vesting schedules to VestingSchedule format for historical view
  const effectiveVestingSchedules = useMemo((): VestingSchedule[] => {
    // For live view, use the fetched vesting schedules
    if (!isViewingHistorical) {
      return vestingSchedules
    }
    // For historical view, convert from reconstructed state
    if (!reconstructedState?.vesting_schedules) {
      return []
    }
    return reconstructedState.vesting_schedules.map(vs => ({
      id: vs.schedule_id.toString(),
      beneficiary: vs.beneficiary,
      total_amount: vs.total_amount,
      released_amount: vs.released_amount,
      vested_amount: vs.released_amount, // In historical, vested = released for simplicity
      start_time: '', // Not available in reconstructed state
      cliff_duration: 0,
      total_duration: 0,
      // New interval-based fields
      interval: 'minute' as const,
      total_intervals: 1,
      intervals_released: vs.released_amount > 0 ? 1 : 0,
      amount_per_interval: vs.total_amount,
      // Deprecated
      vesting_type: 'linear',
      revocable: false,
      is_terminated: vs.is_terminated,
      share_class_id: vs.share_class_id ?? undefined,
      cost_basis: 0,
      price_per_share: 0,
      preference_amount: 0,
    }))
  }, [isViewingHistorical, vestingSchedules, reconstructedState?.vesting_schedules])

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to view the cap table
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
              Viewing historical data reconstructed at slot #{reconstructedState?.slot?.toLocaleString() || selectedSlot?.toLocaleString()}
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
          <h1 className="text-3xl font-bold tracking-tight">Cap Table</h1>
          <p className="text-muted-foreground">
            Ownership distribution for {selectedToken.symbol}
            {isViewingHistorical && ' (Historical)'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchCapTable} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export Report
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
            <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : totalSupply.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Shareholders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : holderCount}</div>
            <p className="text-xs text-muted-foreground">unique holders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Holder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : holders.length > 0 ? `${holders[0].ownership_pct.toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {holders.length > 0 ? `${holders[0].wallet.slice(0, 4)}...${holders[0].wallet.slice(-4)}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card className={isViewingHistorical ? 'border-amber-500/50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Slot</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : capTable?.slot?.toLocaleString() || '—'}</div>
            <p className="text-xs text-muted-foreground">
              {isViewingHistorical ? 'historical snapshot' : 'latest snapshot'}
            </p>
          </CardContent>
        </Card>
      </div>

      <OwnershipDistribution
        holders={holdersWithCostBasis}
        loading={loading}
        title="Ownership Distribution"
        description="Top shareholders by ownership"
        pricePerShare={enhancedCapTable?.price_per_share}
        tokenId={selectedToken?.tokenId}
      />

      {/* Shareholder Vesting - show if there are vesting schedules (works for both live and historical) */}
      {effectiveVestingSchedules.length > 0 && (
        <ShareholderVesting
          tokenId={selectedToken.tokenId}
          schedules={effectiveVestingSchedules}
          loading={loading}
          onRefresh={fetchCapTable}
        />
      )}
    </div>
  )
}
