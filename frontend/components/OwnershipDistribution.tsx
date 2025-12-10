'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table2, PieChart } from 'lucide-react'
import { WalletAddress } from '@/components/WalletAddress'

export interface Holder {
  wallet: string
  balance: number
  ownership_pct: number
}

interface OwnershipDistributionProps {
  holders: Holder[]
  loading?: boolean
  title?: string
  description?: string
}

const PIE_COLORS = [
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

export function OwnershipDistribution({
  holders,
  loading = false,
  title = 'Ownership Distribution',
  description = 'Top shareholders by ownership',
}: OwnershipDistributionProps) {
  const [viewMode, setViewMode] = useState<'table' | 'pie'>('table')

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
      color: PIE_COLORS[idx],
      isOthers: false,
    }))

    if (others.length > 0) {
      const othersTotal = others.reduce((sum, h) => sum + h.balance, 0)
      const othersPct = others.reduce((sum, h) => sum + h.ownership_pct, 0)
      result.push({
        wallet: `Others (${others.length})`,
        balance: othersTotal,
        ownership_pct: othersPct,
        color: PIE_COLORS[10],
        isOthers: true,
      })
    }

    return result
  }, [holders])

  // Generate pie chart SVG paths
  const pieSlices = useMemo(() => {
    if (processedData.length === 0) return []

    const slices: { d: string; color: string; label: string; pct: number }[] = []
    let startAngle = -90 // Start from top

    processedData.forEach((item) => {
      const pct = item.ownership_pct
      if (pct <= 0) return

      const angle = (pct / 100) * 360
      const endAngle = startAngle + angle

      // Convert angles to radians
      const startRad = (startAngle * Math.PI) / 180
      const endRad = (endAngle * Math.PI) / 180

      // Calculate arc points
      const cx = 100
      const cy = 100
      const r = 80

      const x1 = cx + r * Math.cos(startRad)
      const y1 = cy + r * Math.sin(startRad)
      const x2 = cx + r * Math.cos(endRad)
      const y2 = cy + r * Math.sin(endRad)

      const largeArc = angle > 180 ? 1 : 0

      const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`

      slices.push({
        d,
        color: item.color,
        label: item.isOthers ? item.wallet : item.wallet.slice(0, 8) + '...',
        pct: item.ownership_pct,
      })

      startAngle = endAngle
    })

    return slices
  }, [processedData])

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
          >
            <Table2 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'pie' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2"
            onClick={() => setViewMode('pie')}
          >
            <PieChart className="h-4 w-4" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2 font-medium">Shareholder</th>
                  <th className="text-right py-2 px-2 font-medium">Shares</th>
                  <th className="text-right py-2 px-2 font-medium">% Owned</th>
                </tr>
              </thead>
              <tbody>
                {processedData.map((item, idx) => (
                  <tr key={idx} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
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
                    <td className="py-2 px-2 text-right font-medium">
                      {item.balance.toLocaleString()}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {item.ownership_pct.toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center gap-6">
            {/* Pie Chart */}
            <div className="flex-shrink-0">
              <svg width="200" height="200" viewBox="0 0 200 200">
                {pieSlices.map((slice, idx) => (
                  <path
                    key={idx}
                    d={slice.d}
                    fill={slice.color}
                    stroke="hsl(var(--background))"
                    strokeWidth="2"
                    className="transition-opacity hover:opacity-80"
                  />
                ))}
              </svg>
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
                    {item.isOthers ? item.wallet : `${item.wallet.slice(0, 8)}...${item.wallet.slice(-4)}`}
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {item.ownership_pct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
