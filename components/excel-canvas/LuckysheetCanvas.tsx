'use client'

import { useEffect, useRef, useState } from 'react'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4002'

type Tab = 'daily-register' | 'ac' | 'cc' | 'bl'
const TABS: { key: Tab; label: string }[] = [
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

interface Props {
  date: string
  newTransaction?: unknown
}

export default function LuckysheetCanvas({ date, newTransaction }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<Tab>('daily-register')
  const [status, setStatus] = useState('Loading Luckysheet...')
  const [error, setError] = useState('')
  const mountedRef = useRef(false)
  const scriptLoadedRef = useRef(false)

  function loadScripts(): Promise<void> {
    if (scriptLoadedRef.current && window.luckysheet) return Promise.resolve()
    return new Promise((resolve, reject) => {
      if (window.luckysheet) { scriptLoadedRef.current = true; resolve(); return }

      const addCSS = (href: string) => {
        const l = document.createElement('link')
        l.rel = 'stylesheet'; l.href = href
        document.head.appendChild(l)
      }
      addCSS('https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/plugins/css/pluginsCss.css')
      addCSS('https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/plugins/plugins.css')
      addCSS('https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/css/luckysheet.css')
      addCSS('https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/assets/iconfont/iconfont.css')

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/luckysheet@2.1.13/dist/luckysheet.umd.js'
      script.onload = () => { scriptLoadedRef.current = true; resolve() }
      script.onerror = () => reject(new Error('Failed to load Luckysheet script'))
      document.head.appendChild(script)
    })
  }

  async function fetchAndRender(tab: Tab, d: string) {
    setStatus('Fetching data...')
    setError('')
    try {
      const res = await fetch(`${API}/api/sheets/${tab}?date=${d}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'API error')

      const sheetData = json.data || []
      renderSheet(sheetData, TABS.find(t => t.key === tab)?.label ?? 'Sheet')
      setStatus('')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error'
      setError(msg)
      setStatus('')
    }
  }

  function renderSheet(data: unknown[][], name: string) {
    if (!window.luckysheet) return
    try { window.luckysheet.destroy() } catch { /* ignore */ }

    const celldata = (data as Array<Array<{ v: unknown; m: string }>>).flatMap((row, r) =>
      row.map((cell, c) => ({ r, c, v: cell }))
    )

    window.luckysheet.create({
      container: 'luckysheet-box',
      lang: 'en',
      showinfobar: false,
      showstatisticBar: false,
      sheetRightClickConfig: { deleteSheet: false, copySheet: false },
      data: [{
        name,
        index: '0',
        status: 1,
        order: 0,
        row: Math.max((data.length || 0) + 10, 30),
        column: 20,
        defaultRowHeight: 24,
        defaultColWidth: 110,
        celldata,
        config: {},
      }],
    })
  }

  // Initial load + tab/date changes
  useEffect(() => {
    if (mountedRef.current) return
    mountedRef.current = true

    loadScripts()
      .then(() => fetchAndRender(activeTab, date))
      .catch(e => { setError(e.message); setStatus('') })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Tab switch or date change (after mount)
  const prevTabRef = useRef(activeTab)
  const prevDateRef = useRef(date)
  useEffect(() => {
    if (!scriptLoadedRef.current) return
    if (prevTabRef.current === activeTab && prevDateRef.current === date) return
    prevTabRef.current = activeTab
    prevDateRef.current = date
    fetchAndRender(activeTab, date)
  }, [activeTab, date]) // eslint-disable-line react-hooks/exhaustive-deps

  // Append new transaction row
  useEffect(() => {
    if (!newTransaction || !window.luckysheet || activeTab !== 'daily-register') return
    const t = newTransaction as Record<string, unknown>
    try {
      window.luckysheet.insertRow(window.luckysheet.getRangeData().length || 1)
      // Reload cleanly to show updated data
      fetchAndRender('daily-register', date)
    } catch { fetchAndRender('daily-register', date) }
  }, [newTransaction]) // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(tab: Tab) {
    setActiveTab(tab)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-gray-400">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => switchTab(t.key)}
            className={`px-3 py-1 text-xs border-r border-gray-400 ${activeTab === t.key ? 'bg-gray-200 font-bold' : 'hover:bg-gray-100'}`}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => fetchAndRender(activeTab, date)}
          className="px-3 py-1 text-xs ml-auto border-l border-gray-400 hover:bg-gray-100"
        >
          ↺ Refresh
        </button>
      </div>

      {/* Status / error */}
      {status && <div className="text-xs text-gray-500 px-2 py-1 border-b border-gray-300">{status}</div>}
      {error && <div className="text-xs text-red-600 px-2 py-1 border-b border-gray-300">Error: {error}</div>}

      {/* Luckysheet container */}
      <div
        id="luckysheet-box"
        ref={containerRef}
        className="flex-1"
        style={{ minHeight: 400 }}
      />
    </div>
  )
}
