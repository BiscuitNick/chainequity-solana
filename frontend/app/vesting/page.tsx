'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Plus, Calendar, Clock, AlertTriangle, RefreshCw, Check, X } from 'lucide-react'
import { api, VestingSchedule, TerminateVestingRequest } from '@/lib/api'
import { CreateVestingScheduleModal } from '@/components/CreateVestingScheduleModal'
import { WalletAddress } from '@/components/WalletAddress'
import { ShareholderVesting } from '@/components/ShareholderVesting'

type TerminationType = 'standard' | 'for_cause' | 'accelerated'

export default function VestingPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [schedules, setSchedules] = useState<VestingSchedule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionSuccess, setActionSuccess] = useState<string | null>(null)
  const [terminateConfirm, setTerminateConfirm] = useState<{ scheduleId: string; type: TerminationType } | null>(null)
  const [terminateNotes, setTerminateNotes] = useState('')

  const fetchVestingSchedules = async () => {
    if (!selectedToken) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.getVestingSchedules(selectedToken.tokenId)
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

  const handleTerminate = async (scheduleId: string, terminationType: TerminationType, notes: string) => {
    if (!selectedToken) return
    setActionLoading(scheduleId)
    setError(null)
    setActionSuccess(null)

    try {
      await api.terminateVesting(selectedToken.tokenId, scheduleId, {
        termination_type: terminationType,
        notes: notes || undefined,
      })
      setActionSuccess('Successfully terminated vesting schedule')
      setTerminateConfirm(null)
      setTerminateNotes('')
      // Refresh schedules to show updated status
      await fetchVestingSchedules()
      setTimeout(() => setActionSuccess(null), 3000)
    } catch (e: any) {
      setError(e.detail || 'Failed to terminate vesting schedule')
    } finally {
      setActionLoading(null)
    }
  }

  const getStatus = (schedule: VestingSchedule) => {
    if (schedule.is_terminated) return 'terminated'
    if (schedule.released_amount >= schedule.total_amount) return 'completed'
    return 'active'
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/10 text-green-500',
    terminated: 'bg-red-500/10 text-red-500',
    completed: 'bg-blue-500/10 text-blue-500',
  }

  const totalVesting = schedules.reduce((sum, s) => sum + s.total_amount, 0)
  const totalReleased = schedules.reduce((sum, s) => sum + s.released_amount, 0)
  const totalPending = totalVesting - totalReleased

  // Helper to format duration in seconds to human readable
  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds} seconds`
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`
    const days = Math.floor(seconds / 86400)
    if (days >= 365) return `${Math.floor(days / 365)} years`
    if (days >= 30) return `${Math.floor(days / 30)} months`
    return `${days} days`
  }

  // Parse UTC date string from backend (may not have 'Z' suffix)
  const parseUTCDate = (dateStr: string) => {
    const utcDateStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z'
    return new Date(utcDateStr)
  }

  // Helper to format date/time based on duration scale
  const formatDateTime = (date: Date, isShortDuration: boolean) => {
    if (isShortDuration) {
      return date.toLocaleString() // Show date and time for minute/hour durations
    }
    return date.toLocaleDateString()
  }

  // Helper to calculate cliff end date
  const getCliffEndDate = (schedule: VestingSchedule) => {
    const startDate = parseUTCDate(schedule.start_time as unknown as string)
    return new Date(startDate.getTime() + schedule.cliff_duration * 1000)
  }

  // Calculate remaining time until fully vested
  const getRemainingTime = (schedule: VestingSchedule) => {
    const now = Date.now()
    const startTime = parseUTCDate(schedule.start_time as unknown as string).getTime()
    const endTime = startTime + schedule.total_duration * 1000

    if (now >= endTime) return 'Fully vested'
    if (now < startTime) {
      const remainingSeconds = Math.ceil((endTime - startTime) / 1000)
      return formatDuration(remainingSeconds)
    }

    const remainingMs = endTime - now
    const remainingSeconds = Math.ceil(remainingMs / 1000)
    return formatDuration(remainingSeconds)
  }

  // Check if this is a short duration schedule (less than 1 day)
  const isShortDuration = (schedule: VestingSchedule) => {
    return schedule.total_duration < 86400
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

      {actionSuccess && (
        <Card className="border-green-500/50 bg-green-500/10">
          <CardContent className="pt-4 flex items-center gap-2">
            <Check className="h-4 w-4 text-green-500" />
            <p className="text-green-500">{actionSuccess}</p>
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
              {loading ? '...' : schedules.filter(s => !s.is_terminated).length}
            </div>
            <p className="text-xs text-muted-foreground">beneficiaries</p>
          </CardContent>
        </Card>
      </div>

      {/* Shareholder Vesting Table */}
      <ShareholderVesting
        tokenId={selectedToken.tokenId}
        schedules={schedules}
        loading={loading}
        onRefresh={fetchVestingSchedules}
      />

      <Card>
        <CardHeader>
          <CardTitle>Vesting Schedule Management</CardTitle>
          <CardDescription>Manage individual vesting schedules and actions</CardDescription>
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
              {schedules.map((schedule) => {
                const shortDuration = isShortDuration(schedule)
                const startDate = parseUTCDate(schedule.start_time as unknown as string)
                const cliffEndDate = getCliffEndDate(schedule)
                const vestedPercent = (schedule.vested_amount / schedule.total_amount) * 100

                return (
                <div key={schedule.id} className="border rounded-lg p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <WalletAddress address={schedule.beneficiary} />
                        <span className={`px-2 py-0.5 rounded text-xs capitalize ${statusColors[getStatus(schedule)]}`}>
                          {getStatus(schedule)}
                        </span>
                        <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded text-xs">
                          {formatInterval(schedule.interval)}
                        </span>
                        <span className="px-2 py-0.5 bg-muted text-muted-foreground rounded text-xs">
                          {schedule.intervals_released}/{schedule.total_intervals} intervals
                        </span>
                        {schedule.share_class && (
                          <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded text-xs">
                            {schedule.share_class.symbol} ({schedule.share_class.preference_multiple}x pref)
                          </span>
                        )}
                        {schedule.termination_type && (
                          <span className="px-2 py-0.5 bg-orange-500/10 text-orange-500 rounded text-xs">
                            {schedule.termination_type.replace('_', ' ')}
                          </span>
                        )}
                      </div>

                      {/* Time details */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Start:</span>
                          <div className="font-medium">{formatDateTime(startDate, shortDuration)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Cliff ends:</span>
                          <div className="font-medium">
                            {schedule.cliff_duration > 0
                              ? formatDateTime(cliffEndDate, shortDuration)
                              : 'No cliff'}
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Time remaining:</span>
                          <div className="font-medium">{getRemainingTime(schedule)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Duration:</span>
                          <div className="font-medium">{formatDuration(schedule.total_duration)}</div>
                        </div>
                      </div>
                    </div>
                    <div className="text-right ml-4">
                      <div className="text-lg font-bold">
                        {schedule.vested_amount.toLocaleString()} / {schedule.total_amount.toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {vestedPercent.toFixed(1)}% vested
                      </div>
                      <div className="text-xs text-green-500 mt-1">
                        {schedule.released_amount.toLocaleString()} released
                      </div>
                      {schedule.share_class && schedule.preference_amount > 0 && (
                        <div className="text-xs text-purple-500 mt-1">
                          ${(schedule.preference_amount / 100).toLocaleString()} preference
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Tokens vested</span>
                      <span>{vestedPercent.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${vestedPercent}%` }}
                      />
                    </div>
                  </div>
                  {!schedule.is_terminated && schedule.revocable && (
                    <div className="mt-3 space-y-3">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-500"
                          onClick={() => setTerminateConfirm({ scheduleId: schedule.id, type: 'standard' })}
                          disabled={actionLoading === schedule.id}
                        >
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Terminate
                        </Button>
                      </div>

                      {/* Terminate Confirmation UI */}
                      {terminateConfirm?.scheduleId === schedule.id && (
                        <div className="p-3 border border-red-500/30 bg-red-500/5 rounded-md space-y-3">
                          <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                            <AlertTriangle className="h-4 w-4" />
                            Confirm Termination
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Termination Type</label>
                            <select
                              value={terminateConfirm.type}
                              onChange={(e) => setTerminateConfirm({ ...terminateConfirm, type: e.target.value as TerminationType })}
                              className="w-full px-2 py-1 text-sm border rounded bg-background"
                              disabled={actionLoading === schedule.id}
                            >
                              <option value="standard">Standard - Keep vested, stop future vesting</option>
                              <option value="accelerated">Accelerated - 100% immediate vesting</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs text-muted-foreground">Notes (optional)</label>
                            <input
                              type="text"
                              value={terminateNotes}
                              onChange={(e) => setTerminateNotes(e.target.value)}
                              placeholder="Reason for termination..."
                              maxLength={200}
                              className="w-full px-2 py-1 text-sm border rounded bg-background"
                              disabled={actionLoading === schedule.id}
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleTerminate(schedule.id, terminateConfirm.type, terminateNotes)}
                              disabled={actionLoading === schedule.id}
                            >
                              {actionLoading === schedule.id ? 'Terminating...' : 'Confirm Terminate'}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setTerminateConfirm(null); setTerminateNotes('') }}
                              disabled={actionLoading === schedule.id}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Vesting Schedule Modal */}
      <CreateVestingScheduleModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={fetchVestingSchedules}
        tokenId={selectedToken.tokenId}
        tokenSymbol={selectedToken.symbol}
      />
    </div>
  )
}
