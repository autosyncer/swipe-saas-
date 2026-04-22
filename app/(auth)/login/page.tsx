'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#f9f9f9' }}
    >
      <div
        className="bg-white rounded-lg p-8 w-full flex flex-col gap-5"
        style={{
          maxWidth: 400,
          borderRadius: 8,
          border: '1px solid #e5e7eb',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
        }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-lg"
              style={{ background: '#3ECF8E' }}
            >
              S
            </div>
            <span className="text-2xl font-bold text-[#1a1a1a]">SwipeSaaS</span>
          </div>
          <p className="text-sm text-[#6b7280]">Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Email address</label>
            <input
              type="email"
              required
              className="w-full rounded-md border px-3 py-2 text-sm outline-none focus:border-[#3ECF8E] transition-colors"
              style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
              placeholder="admin@swipesaas.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#374151] mb-1">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                className="w-full rounded-md border px-3 py-2 pr-10 text-sm outline-none focus:border-[#3ECF8E] transition-colors"
                style={{ borderColor: '#e5e7eb', borderRadius: 6 }}
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6b7280] hover:text-[#374151]"
                onClick={() => setShowPw(v => !v)}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{ background: '#fee2e2', color: '#991b1b', borderRadius: 6 }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-md text-sm font-semibold text-white transition-colors disabled:opacity-70"
            style={{ background: '#3ECF8E', borderRadius: 6 }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
