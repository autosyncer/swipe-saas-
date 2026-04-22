'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { today } from '@/lib/utils'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'

type SheetTab = 'daily-register' | 'ac' | 'cc' | 'bl'

const TAB_LABELS: { key: SheetTab; label: string }[] = [
  { key: 'daily-register', label: 'Daily Register' },
  { key: 'ac', label: 'AC Sheet' },
  { key: 'cc', label: 'CC Sheet' },
  { key: 'bl', label: 'BL Sheet' },
]

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    luckysheet: any
  }
}

export default function ExcelCanvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<SheetTab>('daily-register')
  const [date, setDate] = useState(today())
  const [luckyLoaded, setLuckyLoaded] = useState(false)
  const [sheetData, setSheetData] = useState<unknown[][]>([])
  const [rawData, setRawData] = useState<unknown[]>([])
  const editDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load Luckysheet script
  useEffect(() => {
    if (window.luckysheet) { setLuckyLoaded(true); return }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/luckysheet.umd.js'
    script.onload = () => setLuckyLoaded(true)
    script.onerror = () => console.error('Failed to load Luckysheet')
    document.head.appendChild(script)

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/css/pluginsCss.css'
    document.head.appendChild(link)

    const link2 = document.createElement('link')
    link2.rel = 'stylesheet'
    link2.href = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/plugins/plugins.css'
    document.head.appendChild(link2)

    const link3 = document.createElement('link')
    link3.rel = 'stylesheet'
    link3.href = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/css/luckysheet.css'
    document.head.appendChild(link3)

    const link4 = document.createElement('link')
    link4.rel = 'stylesheet'
    link4.href = 'https://cdn.jsdelivr.net/npm/luckysheet@latest/dist/assets/iconfont/iconfont.css'
    document.head.appendChild(link4)
  }, [])

  const fetchSheetData = useCallback(async (tab: SheetTab, dateStr: string) => {
    try {
      const res = await fetch(`${API}/api/sheets/${tab}?date=${dateStr}`)
      const json = await res.json()
      setSheetData(json.data || [])
      setRawData(json.rawData || [])
      return json.data || []
    } catch {
      return []
    }
  }, [])

  const initLuckysheet = useCallback((data: unknown[][]) => {
    if (!window.luckysheet || !containerRef.current) return
    try {
      window.luckysheet.destroy()
    } catch { /* ignore */ }

    window.luckysheet.create({
      container: 'luckysheet-container',
      lang: 'en',
      showinfobar: false,
      showstatisticBar: false,
      sheetRightClickConfig: { deleteSheet: false, copySheet: false },
      data: [{
        name: TAB_LABELS.find(t => t.key === activeTab)?.label ?? 'Sheet',
        color: '',
        index: '0',
        status: 1,
        order: 0,
        hide: 0,
        row: Math.max(data.length + 5, 20),
        column: 20,
        defaultRowHeight: 28,
        defaultColWidth: 120,
        celldata: data.flatMap((row, r) =>
          (row as unknown[]).map((cell, c) => ({
            r, c,
            v: cell as { v: unknown; m: string; ct: { fa: string; t: string } }
          }))
        ),
        config: {
          columnlen: Object.fromEntries((data[0] as unknown[] ?? []).map((_: unknown, i: number) => [i, 130])),
        },
      }],
      hook: {
        cellUpdateBefore: (r: number, c: number, value: unknown) => {
          if (r === 0) return false // protect header row
          const txn = (rawData as Array<{ id: string }>)[r - 1]
          if (!txn?.id || activeTab !== 'daily-register') return true
          if (editDebounceRef.current) clearTimeout(editDebounceRef.current)
          editDebounceRef.current = setTimeout(async () => {
            const colMap: Record<number, string> = {
              4: 'total_amount', 5: 'paid_amount', 10: 'remarks', 11: 'status',
            }
            const field = colMap[c]
            if (field) {
              await fetch(`${API}/api/transactions/${txn.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ [field]: value }),
              }).catch(() => {})
            }
          }, 500)
          return true
        },
      },
    })
  }, [activeTab, rawData])

  // Init/reload on tab or date change
  useEffect(() => {
    if (!luckyLoaded) return
    fetchSheetData(activeTab, date).then(data => {
      initLuckysheet(data)
    })
  }, [luckyLoaded, activeTab, date, fetchSheetData, initLuckysheet])

  // Listen for new transaction events
  useEffect(() => {
    function handleNewTxn(e: Event) {
      const txn = (e as CustomEvent).detail
      if (activeTab !== 'daily-register') return
      setRawData(prev => [...prev as unknown[], txn])
      setSheetData(prev => {
        const newRow = [
          { v: '', m: '', ct: { fa: 'General', t: 'g' } },
          { v: txn.date, m: txn.date, ct: { fa: 'General', t: 'g' } },
          { v: txn.customer_name, m: txn.customer_name ?? '', ct: { fa: 'General', t: 'g' } },
          { v: txn.bank_card, m: txn.bank_card ?? '', ct: { fa: 'General', t: 'g' } },
          { v: txn.total_amount, m: String(txn.total_amount ?? ''), ct: { fa: 'General', t: 'g' } },
          { v: txn.paid_amount, m: String(txn.paid_amount ?? ''), ct: { fa: 'General', t: 'g' } },
          { v: txn.account_name, m: txn.account_name ?? '', ct: { fa: 'General', t: 'g' } },
          { v: txn.swap_amount, m: String(txn.swap_amount ?? ''), ct: { fa: 'General', t: 'g' } },
          { v: txn.swap_name, m: txn.swap_name ?? '', ct: { fa: 'General', t: 'g' } },
          { v: txn.difference, m: String(txn.difference ?? ''), ct: { fa: 'General', t: 'g' } },
          { v: txn.remarks, m: txn.remarks ?? '', ct: { fa: 'General', t: 'g' } },
        ]
        const updated = [...prev as unknown[][], newRow]
        return updated
      })
    }
    window.addEventListener('transaction-added', handleNewTxn)
    return () => window.removeEventListener('transaction-added', handleNewTxn)
  }, [activeTab])

  // Re-init when sheetData changes from the event listener
  useEffect(() => {
    if (luckyLoaded && sheetData.length > 0) {
      initLuckysheet(sheetData)
    }
  }, [sheetData]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-gray-200 shrink-0">
        <div className="flex gap-1">
          {TAB_LABELS.map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${activeTab === t.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Luckysheet container */}
      <div className="flex-1 relative">
        {!luckyLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center text-gray-400">
              <div className="animate-spin text-3xl mb-2">⏳</div>
              <p className="text-sm">Loading spreadsheet engine...</p>
            </div>
          </div>
        )}
        <div
          id="luckysheet-container"
          ref={containerRef}
          style={{ width: '100%', height: '100%' }}
        />
      </div>
    </div>
  )
}
