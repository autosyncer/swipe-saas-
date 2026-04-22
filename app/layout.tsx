import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'SwipeSaaS — Fintech ERP',
  description: 'Credit card swipe transaction management',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#f9f9f9] text-[#1a1a1a] antialiased`}>
        {children}
      </body>
    </html>
  )
}
