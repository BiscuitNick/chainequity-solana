'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, Calendar, Clock, AlertTriangle } from 'lucide-react'

interface VestingSchedule {
  id: string
  beneficiary: string
  totalAmount: number
  releasedAmount: number
  startDate: string
  cliffDate: string
  endDate: string
  vestingType: 'linear' | 'cliff' | 'stepped'
  status: 'active' | 'terminated' | 'completed'
  terminationType?: 'standard' | 'for_cause' | 'accelerated'
}

// Mock data for demonstration
const mockVestingSchedules: VestingSchedule[] = [
  {
    id: '1',
    beneficiary: 'Hk4M...8xYq',
    totalAmount: 100000,
    releasedAmount: 25000,
    startDate: '2024-01-01',
    cliffDate: '2025-01-01',
    endDate: '2028-01-01',
    vestingType: 'cliff',
    status: 'active',
  },
  {
    id: '2',
    beneficiary: 'Jm2N...9zWr',
    totalAmount: 50000,
    releasedAmount: 50000,
    startDate: '2023-01-01',
    cliffDate: '2023-07-01',
    endDate: '2024-01-01',
    vestingType: 'linear',
    status: 'completed',
  },
  {
    id: '3',
    beneficiary: 'Lp5Q...3vTs',
    totalAmount: 75000,
    releasedAmount: 18750,
    startDate: '2024-03-01',
    cliffDate: '2024-09-01',
    endDate: '2026-03-01',
    vestingType: 'stepped',
    status: 'terminated',
    terminationType: 'standard',
  },
]

export default function VestingPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const statusColors = {
    active: 'bg-green-500/10 text-green-500',
    terminated: 'bg-red-500/10 text-red-500',
    completed: 'bg-blue-500/10 text-blue-500',
  }

  const totalVesting = mockVestingSchedules.reduce((sum, s) => sum + s.totalAmount, 0)
  const totalReleased = mockVestingSchedules.reduce((sum, s) => sum + s.releasedAmount, 0)
  const totalPending = totalVesting - totalReleased

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage vesting schedules
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
          <h1 className="text-3xl font-bold tracking-tight">Vesting</h1>
          <p className="text-muted-foreground">
            Manage employee and advisor vesting for {selectedToken.symbol}
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Schedule
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total in Vesting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalVesting.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Released</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{totalReleased.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {((totalReleased / totalVesting) * 100).toFixed(1)}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{totalPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">still vesting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockVestingSchedules.filter(s => s.status === 'active').length}
            </div>
            <p className="text-xs text-muted-foreground">beneficiaries</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vesting Schedules</CardTitle>
          <CardDescription>All token vesting schedules and their status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {mockVestingSchedules.map((schedule) => (
              <div key={schedule.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm">{schedule.beneficiary}</span>
                      <span className={`px-2 py-0.5 rounded text-xs capitalize ${statusColors[schedule.status]}`}>
                        {schedule.status}
                      </span>
                      {schedule.terminationType && (
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded text-xs">
                          {schedule.terminationType.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Start: {schedule.startDate}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Cliff: {schedule.cliffDate}
                      </span>
                      <span>End: {schedule.endDate}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">
                      {schedule.releasedAmount.toLocaleString()} / {schedule.totalAmount.toLocaleString()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {((schedule.releasedAmount / schedule.totalAmount) * 100).toFixed(1)}% vested
                    </div>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full transition-all"
                      style={{ width: `${(schedule.releasedAmount / schedule.totalAmount) * 100}%` }}
                    />
                  </div>
                </div>
                {schedule.status === 'active' && (
                  <div className="mt-3 flex gap-2">
                    <Button variant="outline" size="sm">Release Vested</Button>
                    <Button variant="outline" size="sm" className="text-red-500">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Terminate
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
