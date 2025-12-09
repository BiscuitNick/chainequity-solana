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

type NavItem = { name: string; href: string; icon: typeof LayoutDashboard }
type NavDivider = { divider: true }
type NavEntry = NavItem | NavDivider

const navigation: NavEntry[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { divider: true },
  { name: 'Tokens', href: '/tokens', icon: Coins },
  { name: 'Share Issuance', href: '/issuance', icon: CircleDollarSign },
  { divider: true },
  { name: 'Cap Table', href: '/captable', icon: PieChart },
  { name: 'Investments', href: '/investments', icon: TrendingUp },
  { divider: true },
  { name: 'Vesting', href: '/vesting', icon: Calendar },
  { name: 'Dividends', href: '/dividends', icon: Wallet },
  { divider: true },
  { name: 'Governance', href: '/governance', icon: Vote },
  { name: 'Corporate Actions', href: '/corporate-actions', icon: Building2 },
  { divider: true },
  { name: 'Allowlist', href: '/allowlist', icon: Users },
  { name: 'Admin', href: '/admin', icon: Settings },
]

function isDivider(entry: NavEntry): entry is NavDivider {
  return 'divider' in entry
}

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
        {navigation.map((entry, index) => {
          if (isDivider(entry)) {
            return <div key={`divider-${index}`} className="my-2 border-t" />
          }
          const isActive = pathname === entry.href
          return (
            <Link
              key={entry.name}
              href={entry.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <entry.icon className="h-4 w-4" />
              {entry.name}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
