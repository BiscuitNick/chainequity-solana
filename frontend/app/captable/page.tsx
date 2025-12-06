'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Download, PieChart, RefreshCw } from 'lucide-react'
import { api, CapTableResponse, TokenHolder } from '@/lib/api'

export default function CapTablePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchCapTable = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getCapTable(selectedToken.id)
      setCapTable(data)
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
      const blob = await api.exportCapTable(selectedToken.id, 'csv')
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
  }, [selectedToken])

  const typeColors: Record<string, string> = {
    founder: 'bg-purple-500/10 text-purple-500',
    investor: 'bg-blue-500/10 text-blue-500',
    employee: 'bg-green-500/10 text-green-500',
    other: 'bg-gray-500/10 text-gray-500',
  }

  const holders = capTable?.holders || []
  const totalSupply = capTable?.total_supply || 0
  const holderCount = capTable?.holder_count || 0
  const ownershipByType = capTable?.ownership_by_type || {}

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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cap Table</h1>
          <p className="text-muted-foreground">
            Ownership distribution for {selectedToken.symbol}
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
              {loading ? '...' : holders.length > 0 ? `${holders[0].percentage.toFixed(1)}%` : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {holders.length > 0 ? `${holders[0].address.slice(0, 4)}...${holders[0].address.slice(-4)}` : '—'}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Holder Types</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : Object.keys(ownershipByType).length}</div>
            <p className="text-xs text-muted-foreground">categories</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Ownership by Type
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex justify-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : Object.keys(ownershipByType).length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No ownership data available</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(ownershipByType).map(([type, shares]) => (
                  <div key={type}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="capitalize">{type}</span>
                      <span>{totalSupply > 0 ? ((shares / totalSupply) * 100).toFixed(1) : 0}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-3">
                      <div
                        className={`h-3 rounded-full transition-all ${
                          type === 'founder' ? 'bg-purple-500' :
                          type === 'investor' ? 'bg-blue-500' :
                          type === 'employee' ? 'bg-green-500' : 'bg-gray-500'
                        }`}
                        style={{ width: `${totalSupply > 0 ? (shares / totalSupply) * 100 : 0}%` }}
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
                      {holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-primary h-3 rounded-full"
                      style={{ width: `${holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0)}%` }}
                    />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Others</span>
                    <span>
                      {(100 - holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0)).toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className="bg-muted-foreground h-3 rounded-full"
                      style={{ width: `${100 - holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0)}%` }}
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
                    <th className="text-left py-3 px-4 font-medium">Address</th>
                    <th className="text-right py-3 px-4 font-medium">Balance</th>
                    <th className="text-right py-3 px-4 font-medium">UI Balance</th>
                    <th className="text-right py-3 px-4 font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {holders.map((holder, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4 font-mono text-sm">{holder.address}</td>
                      <td className="py-3 px-4 text-right font-medium">{holder.balance.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right text-muted-foreground">{holder.ui_balance.toLocaleString()}</td>
                      <td className="py-3 px-4 text-right">{holder.percentage.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
