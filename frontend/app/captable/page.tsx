'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Download, PieChart } from 'lucide-react'

interface Shareholder {
  address: string
  name?: string
  shares: number
  percentage: number
  type: 'founder' | 'investor' | 'employee' | 'other'
  vestedShares: number
  unlockedShares: number
}

// Mock data for demonstration
const mockShareholders: Shareholder[] = [
  { address: 'Hk4M...8xYq', name: 'Founder Wallet', shares: 400000, percentage: 40.0, type: 'founder', vestedShares: 400000, unlockedShares: 400000 },
  { address: 'Jm2N...9zWr', name: 'Series A Lead', shares: 200000, percentage: 20.0, type: 'investor', vestedShares: 200000, unlockedShares: 200000 },
  { address: 'Lp5Q...3vTs', name: 'Angel Investor', shares: 150000, percentage: 15.0, type: 'investor', vestedShares: 150000, unlockedShares: 150000 },
  { address: 'Nq7R...6uUv', name: 'CTO Vesting', shares: 100000, percentage: 10.0, type: 'employee', vestedShares: 25000, unlockedShares: 25000 },
  { address: 'Ps9T...2wXy', name: 'Employee Pool', shares: 75000, percentage: 7.5, type: 'employee', vestedShares: 18750, unlockedShares: 18750 },
  { address: 'Ru1V...5xZa', shares: 50000, percentage: 5.0, type: 'investor', vestedShares: 50000, unlockedShares: 50000 },
  { address: 'Tw3X...8yBc', shares: 25000, percentage: 2.5, type: 'other', vestedShares: 25000, unlockedShares: 25000 },
]

export default function CapTablePage() {
  const selectedToken = useAppStore((state) => state.selectedToken)

  const typeColors = {
    founder: 'bg-purple-500/10 text-purple-500',
    investor: 'bg-blue-500/10 text-blue-500',
    employee: 'bg-green-500/10 text-green-500',
    other: 'bg-gray-500/10 text-gray-500',
  }

  const totalShares = mockShareholders.reduce((sum, s) => sum + s.shares, 0)
  const totalVested = mockShareholders.reduce((sum, s) => sum + s.vestedShares, 0)

  // Calculate ownership by type
  const ownershipByType = {
    founder: mockShareholders.filter(s => s.type === 'founder').reduce((sum, s) => sum + s.shares, 0),
    investor: mockShareholders.filter(s => s.type === 'investor').reduce((sum, s) => sum + s.shares, 0),
    employee: mockShareholders.filter(s => s.type === 'employee').reduce((sum, s) => sum + s.shares, 0),
    other: mockShareholders.filter(s => s.type === 'other').reduce((sum, s) => sum + s.shares, 0),
  }

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
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Shares</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalShares.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">outstanding</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Shareholders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockShareholders.length}</div>
            <p className="text-xs text-muted-foreground">unique holders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fully Vested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVested.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((totalVested / totalShares) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Holder</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockShareholders[0].percentage}%</div>
            <p className="text-xs text-muted-foreground">{mockShareholders[0].name || mockShareholders[0].address}</p>
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
            <div className="space-y-4">
              {Object.entries(ownershipByType).map(([type, shares]) => (
                <div key={type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="capitalize">{type}</span>
                    <span>{((shares / totalShares) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        type === 'founder' ? 'bg-purple-500' :
                        type === 'investor' ? 'bg-blue-500' :
                        type === 'employee' ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                      style={{ width: `${(shares / totalShares) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Vesting Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Fully Vested</span>
                  <span>{((totalVested / totalShares) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-green-500 h-3 rounded-full"
                    style={{ width: `${(totalVested / totalShares) * 100}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Still Vesting</span>
                  <span>{(((totalShares - totalVested) / totalShares) * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-yellow-500 h-3 rounded-full"
                    style={{ width: `${((totalShares - totalVested) / totalShares) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Shareholder Registry</CardTitle>
          <CardDescription>Complete list of token holders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Address</th>
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">Type</th>
                  <th className="text-right py-3 px-4 font-medium">Shares</th>
                  <th className="text-right py-3 px-4 font-medium">%</th>
                  <th className="text-right py-3 px-4 font-medium">Vested</th>
                  <th className="text-right py-3 px-4 font-medium">Unlocked</th>
                </tr>
              </thead>
              <tbody>
                {mockShareholders.map((holder, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-mono text-sm">{holder.address}</td>
                    <td className="py-3 px-4 text-sm">{holder.name || '—'}</td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs capitalize ${typeColors[holder.type]}`}>
                        {holder.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-medium">{holder.shares.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">{holder.percentage.toFixed(1)}%</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{holder.vestedShares.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right text-muted-foreground">{holder.unlockedShares.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
