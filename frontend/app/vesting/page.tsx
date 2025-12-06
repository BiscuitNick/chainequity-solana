'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, Calendar, Clock, AlertTriangle, RefreshCw } from 'lucide-react'
import { api, VestingSchedule } from '@/lib/api'

export default function VestingPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [schedules, setSchedules] = useState<VestingSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchVestingSchedules = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getVestingSchedules(selectedToken.id)
      setSchedules(data)
    } catch (e: any) {
      console.error('Failed to fetch vesting schedules:', e)
      setError(e.detail || 'Failed to fetch vesting schedules')
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchVestingSchedules()
  }, [selectedToken])

  const statusColors = {
    active: 'bg-green-500/10 text-green-500',
    terminated: 'bg-red-500/10 text-red-500',
    completed: 'bg-blue-500/10 text-blue-500',
  }

  const totalVesting = schedules.reduce((sum, s) => sum + s.total_amount, 0)
  const totalReleased = schedules.reduce((sum, s) => sum + s.released_amount, 0)
  const totalPending = totalVesting - totalReleased

  // Helper to format duration in seconds to human readable
  const formatDuration = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    if (days >= 365) return `${Math.floor(days / 365)} years`
    if (days >= 30) return `${Math.floor(days / 30)} months`
    return `${days} days`
  }

  // Helper to calculate dates from start_time and durations
  const getCliffDate = (schedule: VestingSchedule) => {
    const startDate = new Date(schedule.start_time)
    startDate.setSeconds(startDate.getSeconds() + schedule.cliff_duration)
    return startDate.toLocaleDateString()
  }

  const getEndDate = (schedule: VestingSchedule) => {
    const startDate = new Date(schedule.start_time)
    startDate.setSeconds(startDate.getSeconds() + schedule.total_duration)
    return startDate.toLocaleDateString()
  }

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
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchVestingSchedules} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Schedule
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
            <CardTitle className="text-sm font-medium">Total in Vesting</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? '...' : totalVesting.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">tokens</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Released</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">{loading ? '...' : totalReleased.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {totalVesting > 0 ? ((totalReleased / totalVesting) * 100).toFixed(1) : 0}% of total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-500">{loading ? '...' : totalPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">still vesting</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Active Schedules</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '...' : schedules.filter(s => s.status === 'active').length}
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
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : schedules.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No vesting schedules found
            </p>
          ) : (
            <div className="space-y-4">
              {schedules.map((schedule) => (
                <div key={schedule.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{schedule.beneficiary}</span>
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${statusColors[schedule.status]}`}>
                          {schedule.status}
                        </span>
                        {schedule.termination_type && (
                          <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded text-xs">
                            {schedule.termination_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Start: {new Date(schedule.start_time).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Cliff: {formatDuration(schedule.cliff_duration)}
                        </span>
                        <span>Duration: {formatDuration(schedule.total_duration)}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold">
                        {schedule.released_amount.toLocaleString()} / {schedule.total_amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {((schedule.released_amount / schedule.total_amount) * 100).toFixed(1)}% vested
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(schedule.released_amount / schedule.total_amount) * 100}%` }}
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
          )}
        </CardContent>
      </Card>
    </div>
  )
}
