'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/useAppStore'
import { Split, Type, History, AlertCircle } from 'lucide-react'

interface CorporateAction {
  id: number
  type: 'stock_split' | 'symbol_change' | 'reverse_split'
  description: string
  status: 'pending' | 'executed' | 'cancelled'
  executedAt?: string
  details: Record<string, any>
}

// Mock data
const mockActions: CorporateAction[] = [
  {
    id: 1,
    type: 'stock_split',
    description: '2:1 Stock Split',
    status: 'executed',
    executedAt: '2024-01-15',
    details: { numerator: 2, denominator: 1 },
  },
  {
    id: 2,
    type: 'symbol_change',
    description: 'Symbol changed from ACM to ACME',
    status: 'executed',
    executedAt: '2024-01-01',
    details: { oldSymbol: 'ACM', newSymbol: 'ACME' },
  },
]

export default function CorporateActionsPage() {
  const selectedToken = useAppStore((state) => state.selectedToken)
  const [showSplitModal, setShowSplitModal] = useState(false)
  const [showSymbolModal, setShowSymbolModal] = useState(false)

  const typeIcons = {
    stock_split: <Split className="h-4 w-4" />,
    symbol_change: <Type className="h-4 w-4" />,
    reverse_split: <Split className="h-4 w-4 rotate-180" />,
  }

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-500',
    executed: 'bg-green-500/10 text-green-500',
    cancelled: 'bg-red-500/10 text-red-500',
  }

  if (!selectedToken) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Card className="w-[400px]">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              Select a token from the dropdown to manage corporate actions
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
          <h1 className="text-3xl font-bold tracking-tight">Corporate Actions</h1>
          <p className="text-muted-foreground">
            Stock splits and symbol changes for {selectedToken.symbol}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Split className="h-5 w-5" />
              Stock Split
            </CardTitle>
            <CardDescription>
              Increase or decrease shares proportionally for all holders
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              A stock split divides existing shares into multiple shares. For example, a 2:1 split
              doubles each holder's shares while halving the per-share price equivalent.
            </p>
            <Button onClick={() => setShowSplitModal(true)}>
              <Split className="h-4 w-4 mr-2" />
              Execute Split
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Type className="h-5 w-5" />
              Symbol Change
            </CardTitle>
            <CardDescription>
              Update the token's trading symbol
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Change the token symbol following a rebrand or corporate restructuring.
              This requires multi-sig approval.
            </p>
            <Button onClick={() => setShowSymbolModal(true)}>
              <Type className="h-4 w-4 mr-2" />
              Change Symbol
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="border-yellow-500/50 bg-yellow-500/5">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
            <div>
              <h3 className="font-semibold text-yellow-500">Important Notice</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Corporate actions are irreversible and affect all token holders. They require
                multi-sig approval and may need to pass a governance vote depending on your
                token's configuration. Please ensure compliance with all applicable securities laws.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Action History
          </CardTitle>
          <CardDescription>Past corporate actions for this token</CardDescription>
        </CardHeader>
        <CardContent>
          {mockActions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No corporate actions have been executed
            </p>
          ) : (
            <div className="space-y-4">
              {mockActions.map((action) => (
                <div key={action.id} className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded bg-muted flex items-center justify-center">
                      {typeIcons[action.type]}
                    </div>
                    <div>
                      <p className="font-medium">{action.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {action.executedAt && `Executed on ${action.executedAt}`}
                      </p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs capitalize ${statusColors[action.status]}`}>
                    {action.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
