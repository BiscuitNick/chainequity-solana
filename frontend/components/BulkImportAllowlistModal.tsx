'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react'
import { api } from '@/lib/api'

interface BulkImportAllowlistModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  tokenId: number
}

interface ImportEntry {
  address: string
  kyc_level: number
  status: 'pending' | 'success' | 'error'
  error?: string
}

export function BulkImportAllowlistModal({ isOpen, onClose, onSuccess, tokenId }: BulkImportAllowlistModalProps) {
  const [rawInput, setRawInput] = useState('')
  const [kycLevel, setKycLevel] = useState(1)
  const [autoApprove, setAutoApprove] = useState(false)
  const [entries, setEntries] = useState<ImportEntry[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const parseAddresses = (input: string): string[] => {
    // Split by newlines, commas, or whitespace
    const addresses = input
      .split(/[\n,\s]+/)
      .map(addr => addr.trim())
      .filter(addr => addr.length >= 32 && addr.length <= 44)

    // Remove duplicates
    return [...new Set(addresses)]
  }

  const handleParse = () => {
    setError(null)
    const addresses = parseAddresses(rawInput)

    if (addresses.length === 0) {
      setError('No valid addresses found. Addresses should be 32-44 characters.')
      return
    }

    setEntries(addresses.map(address => ({
      address,
      kyc_level: kycLevel,
      status: 'pending' as const
    })))
  }

  const handleImport = async () => {
    if (entries.length === 0) return

    setIsProcessing(true)
    setProgress({ current: 0, total: entries.length })

    const updatedEntries = [...entries]

    for (let i = 0; i < entries.length; i++) {
      const entry = updatedEntries[i]
      setProgress({ current: i + 1, total: entries.length })

      try {
        if (autoApprove) {
          await api.approveWallet(tokenId, {
            address: entry.address,
            kyc_level: entry.kyc_level
          })
        } else {
          await api.addToAllowlist(tokenId, {
            address: entry.address,
            kyc_level: entry.kyc_level
          })
        }
        updatedEntries[i] = { ...entry, status: 'success' }
      } catch (err: any) {
        updatedEntries[i] = {
          ...entry,
          status: 'error',
          error: err.detail || err.message || 'Failed to add'
        }
      }

      setEntries([...updatedEntries])
    }

    setIsProcessing(false)

    const successCount = updatedEntries.filter(e => e.status === 'success').length
    if (successCount > 0) {
      onSuccess()
    }
  }

  const handleClose = () => {
    setRawInput('')
    setEntries([])
    setProgress({ current: 0, total: 0 })
    setError(null)
    onClose()
  }

  const successCount = entries.filter(e => e.status === 'success').length
  const errorCount = entries.filter(e => e.status === 'error').length
  const pendingCount = entries.filter(e => e.status === 'pending').length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <Card className="relative z-10 w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Bulk Import Allowlist
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <CardDescription>
            Import multiple wallet addresses to the allowlist at once
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 overflow-y-auto flex-1">
          {entries.length === 0 ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">Wallet Addresses</label>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Paste wallet addresses here (one per line, comma-separated, or space-separated)"
                  className="w-full px-3 py-2 border rounded-md bg-background font-mono text-sm min-h-[150px]"
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Supports multiple formats: one address per line, comma-separated, or space-separated
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">KYC Level for All</label>
                  <select
                    value={kycLevel}
                    onChange={(e) => setKycLevel(parseInt(e.target.value))}
                    className="w-full px-3 py-2 border rounded-md bg-background"
                    disabled={isProcessing}
                  >
                    <option value={1}>Tier 1 - Basic</option>
                    <option value={2}>Tier 2 - Enhanced</option>
                    <option value={3}>Tier 3 - Accredited</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Options</label>
                  <div className="flex items-center gap-2 h-[42px]">
                    <input
                      type="checkbox"
                      id="bulkAutoApprove"
                      checked={autoApprove}
                      onChange={(e) => setAutoApprove(e.target.checked)}
                      className="rounded"
                      disabled={isProcessing}
                    />
                    <label htmlFor="bulkAutoApprove" className="text-sm">
                      Auto-approve all
                    </label>
                  </div>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
                  <p className="text-sm text-destructive">{error}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 bg-muted rounded-md">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <FileText className="h-4 w-4" />
                    {entries.length} addresses
                  </span>
                  {successCount > 0 && (
                    <span className="flex items-center gap-1 text-green-500">
                      <CheckCircle2 className="h-4 w-4" />
                      {successCount} imported
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      {errorCount} failed
                    </span>
                  )}
                </div>
                {isProcessing && (
                  <span className="text-sm text-muted-foreground">
                    Processing {progress.current} of {progress.total}...
                  </span>
                )}
              </div>

              <div className="border rounded-md max-h-[300px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Address</th>
                      <th className="text-left p-2">KYC</th>
                      <th className="text-left p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2 font-mono text-xs">
                          {entry.address.slice(0, 8)}...{entry.address.slice(-6)}
                        </td>
                        <td className="p-2">Tier {entry.kyc_level}</td>
                        <td className="p-2">
                          {entry.status === 'pending' && (
                            <span className="text-muted-foreground">Pending</span>
                          )}
                          {entry.status === 'success' && (
                            <span className="text-green-500 flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Imported
                            </span>
                          )}
                          {entry.status === 'error' && (
                            <span className="text-destructive flex items-center gap-1" title={entry.error}>
                              <AlertCircle className="h-3 w-3" />
                              {entry.error?.slice(0, 20)}...
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-between gap-2 border-t pt-4">
          {entries.length === 0 ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleParse} disabled={!rawInput.trim()}>
                Parse Addresses
              </Button>
            </>
          ) : pendingCount > 0 ? (
            <>
              <Button
                variant="outline"
                onClick={() => setEntries([])}
                disabled={isProcessing}
              >
                Back
              </Button>
              <Button onClick={handleImport} disabled={isProcessing}>
                {isProcessing ? `Importing ${progress.current}/${progress.total}...` : `Import ${entries.length} Addresses`}
              </Button>
            </>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                {successCount} imported, {errorCount} failed
              </div>
              <Button onClick={handleClose}>
                Done
              </Button>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
