'use client'

import { useEffect, useState, useCallback } from 'react'
import { useAppStore } from '@/stores/useAppStore'
import { ChevronDown, Check, Clock, Radio, Search, Camera, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api, CapTableSnapshotV2 } from '@/lib/api'

const SLOT_POLL_INTERVAL = 1000 // Poll every 1 second

function formatSlot(slot: number): string {
  return slot.toLocaleString()
}

function formatTimestamp(timestamp: string | null): string {
  if (!timestamp) return 'Unknown'
  const date = new Date(timestamp)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getRelativeTime(timestamp: string | null): string {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return formatTimestamp(timestamp)
}

export function SlotSelector() {
  const {
    selectedToken,
    currentSlot,
    selectedSlot,
    setCurrentSlot,
    setSelectedSlot,
  } = useAppStore()

  const [liveSlot, setLiveSlot] = useState<number | null>(null)
  const [slotError, setSlotError] = useState(false)
  const [manualSlotInput, setManualSlotInput] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<CapTableSnapshotV2[]>([])
  const [snapshotsLoading, setSnapshotsLoading] = useState(false)
  const [creatingSnapshot, setCreatingSnapshot] = useState(false)

  // Fetch current slot from Solana
  const fetchCurrentSlot = useCallback(async () => {
    try {
      const result = await api.getCurrentSlot()
      if (result.slot !== null) {
        setLiveSlot(result.slot)
        setCurrentSlot(result.slot)
        setSlotError(false)
      } else {
        setSlotError(true)
      }
    } catch {
      setSlotError(true)
    }
  }, [setCurrentSlot])

  // Fetch V2 snapshots (with fallback - table might not exist yet)
  const fetchSnapshots = useCallback(async () => {
    if (!selectedToken) return
    setSnapshotsLoading(true)
    try {
      const data = await api.getCapTableSnapshotsV2(selectedToken.tokenId)
      setSnapshots(data)
    } catch (e) {
      // Silently fail - V2 snapshot table might not exist yet
      // This is expected during initial setup
      setSnapshots([])
    } finally {
      setSnapshotsLoading(false)
    }
  }, [selectedToken?.tokenId])

  // Create a new snapshot
  const createSnapshot = async () => {
    if (!selectedToken) return
    setCreatingSnapshot(true)
    try {
      await api.createCapTableSnapshotV2(selectedToken.tokenId)
      await fetchSnapshots() // Refresh the list
    } catch (e) {
      console.error('Failed to create snapshot:', e)
    } finally {
      setCreatingSnapshot(false)
    }
  }

  // Poll for current slot updates
  useEffect(() => {
    fetchCurrentSlot()
    const interval = setInterval(fetchCurrentSlot, SLOT_POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchCurrentSlot])

  // Fetch snapshots when token changes
  useEffect(() => {
    if (selectedToken) {
      fetchSnapshots()
    } else {
      setSnapshots([])
    }
  }, [selectedToken?.tokenId, fetchSnapshots])

  const isLive = selectedSlot === null
  const displaySlot = selectedSlot ?? liveSlot ?? currentSlot

  // Find the selected snapshot for timestamp display
  const selectedSnapshot = selectedSlot
    ? snapshots.find((s) => s.slot === selectedSlot)
    : snapshots[0]

  const handleManualSlotSubmit = () => {
    const slot = parseInt(manualSlotInput.replace(/,/g, ''), 10)
    if (!isNaN(slot) && slot > 0) {
      setSelectedSlot(slot)
      setManualSlotInput('')
      setIsOpen(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleManualSlotSubmit()
    }
    e.stopPropagation()
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-muted-foreground" />
      <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant={isLive ? 'outline' : 'secondary'}
            size="sm"
            className="gap-2 font-mono text-xs"
          >
            {slotError ? (
              <span className="text-destructive">Slot unavailable</span>
            ) : (
              <>
                {isLive && (
                  <span className="flex items-center gap-1">
                    <Radio className="h-3 w-3 text-green-500 animate-pulse" />
                    <span className="text-green-600 font-medium">Live</span>
                  </span>
                )}
                {displaySlot ? (
                  <span className={isLive ? 'text-muted-foreground' : ''}>
                    #{formatSlot(displaySlot)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Loading...</span>
                )}
                {!isLive && selectedSnapshot && (
                  <span className="text-muted-foreground">
                    ({getRelativeTime(selectedSnapshot.timestamp)})
                  </span>
                )}
              </>
            )}
            <ChevronDown className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuItem
            onClick={() => setSelectedSlot(null)}
            className="flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Radio className="h-3 w-3 text-green-500" />
              <span className="font-medium">Live (Current)</span>
              {liveSlot && (
                <span className="text-xs text-muted-foreground font-mono">
                  #{formatSlot(liveSlot)}
                </span>
              )}
            </div>
            {isLive && <Check className="h-4 w-4" />}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Manual slot input */}
          <div className="px-2 py-2">
            <div className="text-xs text-muted-foreground font-medium mb-2">
              Go to specific slot
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter slot number..."
                value={manualSlotInput}
                onChange={(e) => setManualSlotInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onClick={(e) => e.stopPropagation()}
                className="h-8 text-xs font-mono"
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={(e) => {
                  e.stopPropagation()
                  handleManualSlotSubmit()
                }}
                disabled={!manualSlotInput.trim()}
                className="h-8 px-2"
              >
                <Search className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {selectedToken && (
            <>
              <DropdownMenuSeparator />

              {/* Snapshot controls */}
              <div className="px-2 py-2 flex items-center justify-between">
                <div className="text-xs text-muted-foreground font-medium">
                  Snapshots ({snapshots.length})
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      fetchSnapshots()
                    }}
                    disabled={snapshotsLoading}
                    className="h-6 px-2"
                    title="Refresh snapshots"
                  >
                    <RefreshCw className={`h-3 w-3 ${snapshotsLoading ? 'animate-spin' : ''}`} />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation()
                      createSnapshot()
                    }}
                    disabled={creatingSnapshot}
                    className="h-6 px-2"
                    title="Create snapshot now"
                  >
                    <Camera className={`h-3 w-3 ${creatingSnapshot ? 'animate-pulse' : ''}`} />
                  </Button>
                </div>
              </div>

              {snapshots.length > 0 ? (
                <div className="max-h-48 overflow-y-auto">
                  {snapshots.map((snapshot) => (
                    <DropdownMenuItem
                      key={snapshot.id}
                      onClick={() => setSelectedSlot(snapshot.slot)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-sm">
                          #{formatSlot(snapshot.slot)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatTimestamp(snapshot.timestamp)} - {snapshot.holder_count} holders
                          {snapshot.trigger !== 'manual' && (
                            <span className="ml-1 text-[10px] opacity-60">({snapshot.trigger})</span>
                          )}
                        </span>
                      </div>
                      {selectedSlot === snapshot.slot && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>
                  ))}
                </div>
              ) : !snapshotsLoading ? (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  No snapshots yet.
                  <br />
                  <button
                    className="text-primary hover:underline mt-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      createSnapshot()
                    }}
                  >
                    Create your first snapshot
                  </button>
                </div>
              ) : (
                <div className="px-2 py-3 text-xs text-muted-foreground text-center">
                  Loading snapshots...
                </div>
              )}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
