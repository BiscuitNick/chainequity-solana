'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Coins,
  PieChart,
  Calendar,
  Wallet,
  Vote,
  Building2,
  Settings,
  TrendingUp,
  CircleDollarSign,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Allowlist', href: '/allowlist', icon: Users },
  { name: 'Tokens', href: '/tokens', icon: Coins },
  { name: 'Share Issuance', href: '/issuance', icon: CircleDollarSign },
  { name: 'Cap Table', href: '/captable', icon: PieChart },
  { name: 'Investments', href: '/investments', icon: TrendingUp },
  { name: 'Vesting', href: '/vesting', icon: Calendar },
  { name: 'Dividends', href: '/dividends', icon: Wallet },
  { name: 'Governance', href: '/governance', icon: Vote },
  { name: 'Corporate Actions', href: '/corporate-actions', icon: Building2 },
  { name: 'Admin', href: '/admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-64 border-r bg-background">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-bold">CE</span>
          </div>
          <span className="font-semibold">ChainEquity</span>
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
