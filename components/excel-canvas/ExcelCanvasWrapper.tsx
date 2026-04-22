'use client'

import dynamic from 'next/dynamic'

const ExcelCanvas = dynamic(() => import('./ExcelCanvas'), { ssr: false })

export default function ExcelCanvasWrapper() {
  return <ExcelCanvas />
}
