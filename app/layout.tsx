import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { PWAInit } from '@/components/PWAInit'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SwipeSaaS — Fintech ERP',
  description: 'Credit card swipe transaction management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="SwipeSaaS" />
        <meta name="theme-color" content="#3ECF8E" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
      </head>
      <body className={`${inter.className} bg-[#f9f9f9] text-[#1a1a1a] antialiased`}>
        {children}
        <PWAInit />
      </body>
    </html>
  )
}
