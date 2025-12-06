'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppStore } from '@/stores/useAppStore'
import api, { CapTableResponse, Proposal, Transfer, TransferStatsResponse, IssuanceStatsResponse, TokenIssuance } from '@/lib/api'

// Combined activity type for displaying both transfers and issuances
type Activity = {
  id: string
  type: 'transfer' | 'issuance'
  from: string
  to: string
  amount: number
  timestamp: string
  status: string
}

export default function DashboardPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [capTable, setCapTable] = useState<CapTableResponse | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [transferStats, setTransferStats] = useState<TransferStatsResponse | null>(null)
  const [issuanceStats, setIssuanceStats] = useState<IssuanceStatsResponse | null>(null)
  const [recentActivity, setRecentActivity] = useState<Activity[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedToken?.tokenId === undefined || selectedToken?.tokenId === null) return

    const fetchData = async () => {
      setLoading(true)
      try {
        const [capTableData, proposalsData, transferStatsData, issuanceStatsData, transfersData, issuancesData] = await Promise.all([
          api.getCapTable(selectedToken.tokenId),
          api.getProposals(selectedToken.tokenId, 'active').catch(() => []),
          api.getTransferStats(selectedToken.tokenId).catch(() => null),
          api.getIssuanceStats(selectedToken.tokenId).catch(() => null),
          api.getRecentTransfers(selectedToken.tokenId, 5).catch(() => []),
          api.getRecentIssuances(selectedToken.tokenId, 5).catch(() => []),
        ])
        setCapTable(capTableData)
        setProposals(proposalsData)
        setTransferStats(transferStatsData)
        setIssuanceStats(issuanceStatsData)

        // Combine transfers and issuances into activity feed
        const activities: Activity[] = [
          ...transfersData.map((t: Transfer) => ({
            id: `transfer-${t.id}`,
            type: 'transfer' as const,
            from: t.from_wallet,
            to: t.to_wallet,
            amount: t.amount,
            timestamp: t.block_time,
            status: t.status,
          })),
          ...issuancesData.map((i: TokenIssuance) => ({
            id: `issuance-${i.id}`,
            type: 'issuance' as const,
            from: 'MINT',
            to: i.recipient,
            amount: i.amount,
            timestamp: i.created_at,
            status: i.status,
          })),
        ]

        // Sort by timestamp descending and take top 5
        activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setRecentActivity(activities.slice(0, 5))
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [selectedToken?.tokenId])

  const activeProposalsCount = proposals.filter(p => p.status === 'active').length
  const activity24h = (transferStats?.transfers_24h ?? 0) + (issuanceStats?.issuances_24h ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          {selectedToken
            ? `Overview for ${selectedToken.symbol}`
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
            <CardTitle className="text-sm font-medium">Activity (24h)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {activity24h > 0 ? activity24h : '—'}
            </div>
            <p className="text-xs text-muted-foreground">
              {issuanceStats?.issuances_24h ?? 0} mints, {transferStats?.transfers_24h ?? 0} transfers
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ownership Distribution</CardTitle>
            <CardDescription>Token holder breakdown</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
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
                      <span className="text-sm font-mono truncate max-w-[180px]">
                        {holder.wallet.slice(0, 4)}...{holder.wallet.slice(-4)}
                      </span>
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
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest token movements and issuances</CardDescription>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Loading...</p>
              </div>
            ) : recentActivity.length > 0 ? (
              <div className="space-y-3">
                {recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between text-sm">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          activity.type === 'issuance'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}>
                          {activity.type === 'issuance' ? 'MINT' : 'TRANSFER'}
                        </span>
                        <span className="font-mono text-xs">
                          {activity.from === 'MINT' ? 'MINT' : `${activity.from.slice(0, 4)}...${activity.from.slice(-4)}`} → {activity.to.slice(0, 4)}...{activity.to.slice(-4)}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(activity.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">{activity.amount.toLocaleString()}</div>
                      <span className={`text-xs ${
                        activity.status === 'success' || activity.status === 'completed'
                          ? 'text-green-600'
                          : activity.status === 'pending'
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}>
                        {activity.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">No recent activity</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
