import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { PrototypeDisclaimer } from '@/components/PrototypeDisclaimer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'ChainEquity - Tokenized Securities Platform',
  description: 'Tokenized security prototype with compliance gating on Solana',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <div className="flex min-h-screen">
            <Sidebar />
            <div className="flex-1 flex flex-col">
              <Header />
              <main className="flex-1 p-6 pb-16">
                {children}
              </main>
            </div>
          </div>
          <PrototypeDisclaimer />
        </Providers>
      </body>
    </html>
  )
}
