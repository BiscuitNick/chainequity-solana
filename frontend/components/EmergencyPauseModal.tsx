'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, AlertTriangle, Pause, Play, ShieldAlert } from 'lucide-react'
import { api } from '@/lib/api'

interface EmergencyPauseModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
  tokenSymbol: string
  currentlyPaused: boolean
}

export function EmergencyPauseModal({
  isOpen,
  onClose,
  onSuccess,
  tokenId,
  tokenSymbol,
  currentlyPaused
}: EmergencyPauseModalProps) {
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const requiredConfirmText = currentlyPaused ? 'RESUME' : 'PAUSE'
  const action = currentlyPaused ? 'resume' : 'pause'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (confirmText !== requiredConfirmText) {
      setError(`Please type ${requiredConfirmText} to confirm`)
      return
    }

    if (!currentlyPaused && !reason.trim()) {
      setError('Please provide a reason for the emergency pause')
      return
    }

    setIsSubmitting(true)

    try {
      await api.setPaused(tokenId, !currentlyPaused)
      setConfirmText('')
      setReason('')
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.detail || err.message || `Failed to ${action} token`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleClose = () => {
    setConfirmText('')
    setReason('')
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <Card className="relative z-10 w-full max-w-md mx-4">
        <CardHeader className={currentlyPaused ? '' : 'border-b-2 border-yellow-500'}>
          <div className="flex items-center justify-between">
            <CardTitle className={`flex items-center gap-2 ${currentlyPaused ? 'text-green-500' : 'text-yellow-500'}`}>
              {currentlyPaused ? (
                <>
                  <Play className="h-5 w-5" />
                  Resume Trading
                </>
              ) : (
                <>
                  <ShieldAlert className="h-5 w-5" />
                  Emergency Pause
                </>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            {currentlyPaused
              ? `Resume all trading activity for ${tokenSymbol}`
              : `Immediately halt all trading activity for ${tokenSymbol}`
            }
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {currentlyPaused ? (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <div className="flex items-start gap-3">
                  <Play className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-500">Ready to Resume</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Trading is currently paused. Resuming will allow all transfers and trading activity to continue.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-yellow-500">Warning: This will immediately stop all trading</p>
                      <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                        <li>- All token transfers will be blocked</li>
                        <li>- Pending transactions will fail</li>
                        <li>- Users will not be able to buy, sell, or transfer</li>
                        <li>- This action requires multi-sig approval to reverse</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Reason for Emergency Pause</label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe the reason for this emergency action..."
                    className="w-full px-3 py-2 border rounded-md bg-background min-h-[80px]"
                    disabled={isSubmitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    This will be logged for audit purposes
                  </p>
                </div>
              </>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">
                Type {requiredConfirmText} to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder={requiredConfirmText}
                className="w-full px-3 py-2 border rounded-md bg-background font-mono"
                disabled={isSubmitting}
              />
            </div>

            {error && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}
          </CardContent>

          <CardFooter className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={currentlyPaused ? 'default' : 'destructive'}
              disabled={isSubmitting || confirmText !== requiredConfirmText}
            >
              {isSubmitting ? (
                currentlyPaused ? 'Resuming...' : 'Pausing...'
              ) : (
                <>
                  {currentlyPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume Trading
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Emergency Pause
                    </>
                  )}
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
