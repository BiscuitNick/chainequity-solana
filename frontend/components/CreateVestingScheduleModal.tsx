'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Calendar, Clock, AlertTriangle } from 'lucide-react'
import { api, VestingInterval } from '@/lib/api'
import { ApprovedWalletSelector } from '@/components/ApprovedWalletSelector'

interface CreateVestingScheduleModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
  tokenSymbol: string
}

// Maps time unit to VestingInterval for API
type TimeUnit = 'minutes' | 'hours' | 'days' | 'months'

const timeUnitToInterval: Record<TimeUnit, VestingInterval> = {
  minutes: 'minute',
  hours: 'hour',
  days: 'day',
  months: 'month',
}

const timeUnitLabels: Record<TimeUnit, string> = {
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  months: 'Months',
}

// Convert time value to seconds based on unit
const toSeconds = (value: number, unit: TimeUnit): number => {
  switch (unit) {
    case 'minutes': return value * 60
    case 'hours': return value * 60 * 60
    case 'days': return value * 24 * 60 * 60
    case 'months': return value * 30 * 24 * 60 * 60
  }
}

// Format duration for display
const formatDuration = (value: number, unit: TimeUnit): string => {
  if (value === 1) {
    return `1 ${unit.slice(0, -1)}`
  }
  return `${value} ${unit}`
}

export function CreateVestingScheduleModal({
  isOpen,
  onClose,
  onSuccess,
  tokenId,
  tokenSymbol
}: CreateVestingScheduleModalProps) {
  const [beneficiary, setBeneficiary] = useState('')
  const [totalAmount, setTotalAmount] = useState('')
  const [timeUnit, setTimeUnit] = useState<TimeUnit>('months')
  const [cliffValue, setCliffValue] = useState('12')
  const [durationValue, setDurationValue] = useState('48')
  const [startNow, setStartNow] = useState(true)
  const [startDate, setStartDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [startTime, setStartTime] = useState(() => {
    const now = new Date()
    return now.toTimeString().slice(0, 5)
  })
  const [revocable, setRevocable] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Cost basis tracking (vesting is always common stock)
  const [costBasis, setCostBasis] = useState('')
  const [pricePerShare, setPricePerShare] = useState('')

  if (!isOpen) return null

  // For demo mode (minutes/hours), always show time picker when custom start is selected
  const isDemoMode = timeUnit === 'minutes' || timeUnit === 'hours'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // Validate beneficiary address (basic Solana pubkey check)
    if (!beneficiary || beneficiary.length < 32 || beneficiary.length > 44) {
      setError('Please enter a valid Solana wallet address')
      return
    }

    const amountNum = parseInt(totalAmount)
    if (!totalAmount || isNaN(amountNum) || amountNum <= 0) {
      setError('Please enter a valid amount greater than 0')
      return
    }

    const cliffNum = parseInt(cliffValue)
    const durationNum = parseInt(durationValue)

    if (isNaN(cliffNum) || cliffNum < 0) {
      setError('Please enter a valid cliff duration')
      return
    }

    if (isNaN(durationNum) || durationNum <= 0) {
      setError('Please enter a valid total duration greater than 0')
      return
    }

    if (cliffNum > durationNum) {
      setError('Cliff duration cannot exceed total duration')
      return
    }

    // Convert to seconds based on selected unit
    const cliffSeconds = toSeconds(cliffNum, timeUnit)
    const durationSeconds = toSeconds(durationNum, timeUnit)

    // Determine start timestamp
    let startTimestamp: number
    if (startNow) {
      // Start immediately
      startTimestamp = Math.floor(Date.now() / 1000)
    } else if (isDemoMode || !startNow) {
      // Custom start with date and time
      const dateTimeStr = `${startDate}T${startTime}:00`
      startTimestamp = Math.floor(new Date(dateTimeStr).getTime() / 1000)
    } else {
      // Custom start date only (for non-demo mode)
      startTimestamp = Math.floor(new Date(startDate).getTime() / 1000)
    }

    // Get the interval based on time unit
    const interval = timeUnitToInterval[timeUnit]

    setIsSubmitting(true)

    try {
      // Parse cost basis and price per share (convert dollars to cents)
      const costBasisCents = costBasis ? Math.round(parseFloat(costBasis) * 100) : 0
      const pricePerShareCents = pricePerShare ? Math.round(parseFloat(pricePerShare) * 100) : 0

      await api.createVestingSchedule(tokenId, {
        beneficiary,
        total_amount: amountNum,
        start_time: startTimestamp,
        cliff_seconds: cliffSeconds,
        duration_seconds: durationSeconds,
        interval,
        revocable,
        cost_basis: costBasisCents || undefined,
        price_per_share: pricePerShareCents || undefined,
      })

      setSuccess(`Successfully created vesting schedule for ${amountNum.toLocaleString()} ${tokenSymbol}`)

      // Reset form and close after short delay
      setTimeout(() => {
        setBeneficiary('')
        setTotalAmount('')
        setTimeUnit('months')
        setCliffValue('12')
        setDurationValue('48')
        setStartNow(true)
        setRevocable(true)
        setCostBasis('')
        setPricePerShare('')
        setSuccess(null)
        onSuccess()
        onClose()
      }, 1500)
    } catch (err: any) {
      setError(err.detail || err.message || 'Failed to create vesting schedule')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!isSubmitting) {
      setError(null)
      setSuccess(null)
      onClose()
    }
  }

  // Calculate vest rate for summary (interval-based discrete vesting)
  const getVestRateText = () => {
    const amount = parseInt(totalAmount || '0')
    const duration = parseInt(durationValue || '1')
    if (amount <= 0 || duration <= 0) return null

    // Duration is the number of intervals (e.g., 8 minutes = 8 intervals)
    const amountPerInterval = Math.floor(amount / duration)
    const unitSingular = timeUnit.slice(0, -1)

    return `${amountPerInterval.toLocaleString()} ${tokenSymbol} per ${unitSingular} (${duration} intervals)`
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={handleClose}
      />

      {/* Modal */}
      <Card className="relative z-10 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              <CardTitle>Create Vesting Schedule</CardTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isSubmitting}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Create a new token vesting schedule for {tokenSymbol}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {/* Recipient Wallet */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Recipient Wallet</label>
              <ApprovedWalletSelector
                tokenId={tokenId}
                value={beneficiary}
                onChange={setBeneficiary}
                placeholder="Select an approved wallet"
                disabled={isSubmitting}
              />
              <p className="text-xs text-muted-foreground">
                The wallet that will receive vested tokens
              </p>
            </div>

            {/* Total Amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Total Amount</label>
              <div className="relative">
                <input
                  type="number"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="Enter total tokens to vest"
                  min="1"
                  className="w-full px-3 py-2 border rounded-md bg-background pr-16"
                  disabled={isSubmitting}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {tokenSymbol}
                </span>
              </div>
            </div>

            {/* Cost Basis and Price Per Share (optional) */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cost Basis ($)</label>
                <input
                  type="number"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Total amount paid (optional)
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Price Per Share ($)</label>
                <input
                  type="number"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  className="w-full px-3 py-2 border rounded-md bg-background"
                  disabled={isSubmitting}
                />
                <p className="text-xs text-muted-foreground">
                  Strike price (optional)
                </p>
              </div>
            </div>

            {/* Vesting Interval */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Vesting Interval</label>
              <select
                value={timeUnit}
                onChange={(e) => {
                  const newUnit = e.target.value as TimeUnit
                  setTimeUnit(newUnit)
                  // Reset to sensible defaults for the new unit
                  if (newUnit === 'minutes') {
                    setCliffValue('2')
                    setDurationValue('10')
                  } else if (newUnit === 'hours') {
                    setCliffValue('1')
                    setDurationValue('4')
                  } else if (newUnit === 'days') {
                    setCliffValue('7')
                    setDurationValue('30')
                  } else {
                    setCliffValue('12')
                    setDurationValue('48')
                  }
                }}
                className="w-full px-3 py-2 border rounded-md bg-background"
                disabled={isSubmitting}
              >
                {Object.entries(timeUnitLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              {isDemoMode && (
                <p className="text-xs text-yellow-500">
                  Demo mode: Using short time intervals for testing
                </p>
              )}
            </div>

            {/* Start Time Option */}
            <div className="space-y-3">
              <label className="text-sm font-medium">Start Time</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="startOption"
                    checked={startNow}
                    onChange={() => setStartNow(true)}
                    className="h-4 w-4"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm">Start Now</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="startOption"
                    checked={!startNow}
                    onChange={() => setStartNow(false)}
                    className="h-4 w-4"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm">Custom Start</span>
                </label>
              </div>

              {!startNow && (
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    disabled={isSubmitting}
                  />
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    disabled={isSubmitting}
                  />
                </div>
              )}
            </div>

            {/* Cliff and Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Cliff Period</label>
                <div className="relative">
                  <input
                    type="number"
                    value={cliffValue}
                    onChange={(e) => setCliffValue(e.target.value)}
                    min="0"
                    className="w-full px-3 py-2 border rounded-md bg-background pr-20"
                    disabled={isSubmitting}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {timeUnit}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  No tokens vest during cliff
                </p>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Duration</label>
                <div className="relative">
                  <input
                    type="number"
                    value={durationValue}
                    onChange={(e) => setDurationValue(e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 border rounded-md bg-background pr-20"
                    disabled={isSubmitting}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    {timeUnit}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Full vesting period
                </p>
              </div>
            </div>

            {/* Revocable Option */}
            <div className="flex items-center gap-3 p-3 bg-muted rounded-md">
              <input
                type="checkbox"
                id="revocable"
                checked={revocable}
                onChange={(e) => setRevocable(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                disabled={isSubmitting}
              />
              <div>
                <label htmlFor="revocable" className="text-sm font-medium cursor-pointer">
                  Revocable Schedule
                </label>
                <p className="text-xs text-muted-foreground">
                  Allow administrators to terminate this vesting schedule early
                </p>
              </div>
            </div>

            {/* Summary */}
            {totalAmount && durationValue && (
              <div className="p-3 bg-muted rounded-md space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Schedule Summary
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Total:</span>
                  <span>{parseInt(totalAmount || '0').toLocaleString()} {tokenSymbol}</span>
                  <span className="text-muted-foreground">Share Class:</span>
                  <span>Common Stock</span>
                  <span className="text-muted-foreground">Interval:</span>
                  <span>{timeUnitLabels[timeUnit]}</span>
                  {costBasis && (
                    <>
                      <span className="text-muted-foreground">Cost Basis:</span>
                      <span>${parseFloat(costBasis).toLocaleString()}</span>
                    </>
                  )}
                  {pricePerShare && (
                    <>
                      <span className="text-muted-foreground">Price/Share:</span>
                      <span>${parseFloat(pricePerShare).toFixed(2)}</span>
                    </>
                  )}
                  <span className="text-muted-foreground">Starts:</span>
                  <span>{startNow ? 'Immediately' : `${startDate} ${startTime}`}</span>
                  <span className="text-muted-foreground">Cliff ends:</span>
                  <span>{formatDuration(parseInt(cliffValue || '0'), timeUnit)} from start</span>
                  <span className="text-muted-foreground">Fully vested:</span>
                  <span>{formatDuration(parseInt(durationValue || '0'), timeUnit)} from start</span>
                  {getVestRateText() && (
                    <>
                      <span className="text-muted-foreground">Vest rate:</span>
                      <span>{getVestRateText()}</span>
                    </>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {success && (
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                <p className="text-sm text-green-500">{success}</p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !beneficiary || !totalAmount}
            >
              {isSubmitting ? 'Creating...' : 'Create Schedule'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
