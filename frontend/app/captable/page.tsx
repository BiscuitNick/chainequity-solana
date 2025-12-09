'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Download, PieChart, RefreshCw, AlertTriangle } from 'lucide-react'
import { api, CapTableResponse, CapTableEntry, CapTableSnapshotV2Detail } from '@/lib/api'
import { WalletAddress } from '@/components/WalletAddress'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function CapTablePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const selectedSlot = useAppStore((state) => state.selectedSlot)
  const setSelectedSlot = useAppStore((state) => state.setSelectedSlot)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [historicalSnapshot, setHistoricalSnapshot] = useState<CapTableSnapshotV2Detail | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isViewingHistorical = selectedSlot !== null

  const fetchCapTable = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    setHistoricalSnapshot(null)
    try {
      if (isViewingHistorical && selectedSlot !== null) {
        // Use V2 snapshot API for historical data
        const snapshot = await api.getCapTableSnapshotV2AtSlot(selectedToken.tokenId, selectedSlot)
        setHistoricalSnapshot(snapshot)
        // Convert snapshot to CapTableResponse format for display
        const capTableFromSnapshot: CapTableResponse = {
          slot: snapshot.slot,
          timestamp: snapshot.timestamp || new Date().toISOString(),
          total_supply: snapshot.total_supply,
          holder_count: snapshot.holder_count,
          holders: snapshot.holders.map((h: any) => ({
            wallet: h.wallet,
            balance: h.balance,
            ownership_pct: snapshot.total_supply > 0 ? (h.balance / snapshot.total_supply) * 100 : 0,
            vested: 0,
            unvested: 0,
            status: h.status || 'active',
          })),
        }
        setCapTable(capTableFromSnapshot)
      } else {
        // Live data - use current cap table
        const data = await api.getCapTable(selectedToken.tokenId)
        setCapTable(data)
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Ownership Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : holders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No holders found</p>
            ) : (
              <div className="space-y-4">
                {holders.slice(0, 5).map((holder, idx) => (
                  <div key={idx}>
                    <div className="flex justify-between text-sm mb-1">
                      <WalletAddress address={holder.wallet} />
                      <span>{holder.ownership_pct.toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className="bg-primary h-3 rounded-full transition-all"
                        style={{ width: `${holder.ownership_pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribution Overview</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Top 10 Holders</span>
                    <span>
                      {holders.slice(0, 10).reduce((sum, h) => sum + h.ownership_pct, 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full"
                      style={{ width: `${holders.slice(0, 10).reduce((sum, h) => sum + h.ownership_pct, 0)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Others</span>
                    <span>
                      {(100 - holders.slice(0, 10).reduce((sum, h) => sum + h.ownership_pct, 0)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-muted-foreground h-3 rounded-full"
                      style={{ width: `${100 - holders.slice(0, 10).reduce((sum, h) => sum + h.ownership_pct, 0)}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shareholder Registry</CardTitle>
          <CardDescription>Complete list of token holders</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : holders.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No holders found</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Wallet</th>
                    <th className="text-right py-3 px-4 font-medium">Balance</th>
                    <th className="text-right py-3 px-4 font-medium">Ownership %</th>
                    <th className="text-right py-3 px-4 font-medium">Vested</th>
                    <th className="text-right py-3 px-4 font-medium">Unvested</th>
                    <th className="text-right py-3 px-4 font-medium">% Vested</th>
                    <th className="text-right py-3 px-4 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((holder, idx) => {
                    const totalVesting = holder.vested + holder.unvested
                    const vestedPercent = totalVesting > 0 ? (holder.vested / totalVesting) * 100 : 0
                    return (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">
                        <WalletAddress address={holder.wallet} />
                      </td>
                      <td className="py-3 px-4 text-right font-medium">{holder.balance.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{holder.ownership_pct.toFixed(4)}%</td>
                      <td className="py-3 px-4 text-right text-green-500">{holder.vested.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-yellow-500">{holder.unvested.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">
                        {totalVesting > 0 ? `${vestedPercent.toFixed(1)}%` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <span className={`px-2 py-1 rounded text-xs ${
                          holder.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-gray-500/10 text-gray-500'
                        }`}>
                          {holder.status}
                        </span>
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
