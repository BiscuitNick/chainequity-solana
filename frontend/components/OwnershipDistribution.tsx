'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table2, PieChart as PieChartIcon, BarChart3 } from 'lucide-react'
import { WalletAddress } from '@/components/WalletAddress'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

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

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    payload: {
      wallet: string
      balance: number
      ownership_pct: number
      isOthers: boolean
    }
  }>
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  return (
    <div className="bg-popover border rounded-md shadow-md p-2 text-sm">
      <p className="font-medium">{truncateWallet(data.wallet, data.isOthers)}</p>
      <p className="text-muted-foreground">
        {data.balance.toLocaleString()} shares ({data.ownership_pct.toFixed(2)}%)
      </p>
    </div>
  )
}

export function OwnershipDistribution({
  holders,
  loading = false,
  title = 'Ownership Distribution',
  description = 'Top shareholders by ownership',
}: OwnershipDistributionProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('table')

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
    }))

    if (others.length > 0) {
      const othersTotal = others.reduce((sum, h) => sum + h.balance, 0)
      const othersPct = others.reduce((sum, h) => sum + h.ownership_pct, 0)
      const othersName = `Others (${others.length})`
      result.push({
        wallet: othersName,
        balance: othersTotal,
        ownership_pct: othersPct,
        color: CHART_COLORS[10],
        isOthers: true,
        name: othersName,
      })
    }

    return result
  }, [holders])

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
                  <Tooltip content={<CustomTooltip />} />
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
                <Tooltip content={<CustomTooltip />} />
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
