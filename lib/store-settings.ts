export interface StoreSettings {
  name: string
  address: string
  bankName: string
  accNo: string
  ifsc: string
  jurisdiction: string
  gstNo?: string
}

const KEY = 'swipe_store_settings'

export const DEFAULT_STORE: StoreSettings = {
  name:         'Mahalaxmi Grain Store',
  address:      'Shop No. 109, Orchid Harmony,\nPalanpur,\nSurat',
  bankName:     'BANK OF BARODA CA',
  accNo:        '028102000002596',
  ifsc:         'UDHNA SURAT & BARB0UDHNAX',
  jurisdiction: 'SUBJECT TO SURAT JURISDICTION',
}

export function loadStoreSettings(): StoreSettings {
  if (typeof window === 'undefined') return { ...DEFAULT_STORE }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_STORE }
    return { ...DEFAULT_STORE, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_STORE }
  }
}

export function saveStoreSettings(s: StoreSettings): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(s))
}
