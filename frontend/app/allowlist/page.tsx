'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { UserPlus, UserMinus, Search, Download, Upload } from 'lucide-react'

interface AllowlistEntry {
  address: string
  kycLevel: number
  status: 'active' | 'pending' | 'revoked'
  addedAt: string
  addedBy: string
}

// Mock data for demonstration
const mockAllowlist: AllowlistEntry[] = [
  { address: 'Hk4M...8xYq', kycLevel: 3, status: 'active', addedAt: '2024-01-15', addedBy: 'Admin' },
  { address: 'Jm2N...9zWr', kycLevel: 2, status: 'active', addedAt: '2024-01-14', addedBy: 'Admin' },
  { address: 'Lp5Q...3vTs', kycLevel: 1, status: 'pending', addedAt: '2024-01-13', addedBy: 'Admin' },
  { address: 'Nq7R...6uUv', kycLevel: 3, status: 'active', addedAt: '2024-01-12', addedBy: 'Admin' },
  { address: 'Ps9T...2wXy', kycLevel: 2, status: 'revoked', addedAt: '2024-01-10', addedBy: 'Admin' },
]

export default function AllowlistPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const filteredEntries = mockAllowlist.filter(entry =>
    entry.address.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const statusColors = {
    active: 'bg-green-500/10 text-green-500',
    pending: 'bg-yellow-500/10 text-yellow-500',
    revoked: 'bg-red-500/10 text-red-500',
  }

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage its allowlist
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
          <h1 className="text-3xl font-bold tracking-tight">Allowlist</h1>
          <p className="text-muted-foreground">
            Manage approved wallets for {selectedToken.symbol}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Bulk Import
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Wallet
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockAllowlist.filter(e => e.status === 'active').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockAllowlist.filter(e => e.status === 'pending').length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">KYC Tier 3</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockAllowlist.filter(e => e.kycLevel === 3).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Revoked</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {mockAllowlist.filter(e => e.status === 'revoked').length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Approved Wallets</CardTitle>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search addresses..."
                className="pl-10 pr-4 py-2 border rounded-md text-sm w-64"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-medium">Wallet Address</th>
                  <th className="text-left py-3 px-4 font-medium">KYC Level</th>
                  <th className="text-left py-3 px-4 font-medium">Status</th>
                  <th className="text-left py-3 px-4 font-medium">Added</th>
                  <th className="text-left py-3 px-4 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((entry, idx) => (
                  <tr key={idx} className="border-b hover:bg-muted/50">
                    <td className="py-3 px-4 font-mono text-sm">{entry.address}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-1 bg-blue-500/10 text-blue-500 rounded text-xs">
                        Tier {entry.kycLevel}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">{entry.addedAt}</td>
                    <td className="py-3 px-4">
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-600">
                        <UserMinus className="h-4 w-4" />
                      </Button>
                    </td>
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
