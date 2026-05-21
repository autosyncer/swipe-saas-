'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/customers', label: 'Customers', icon: '👥' },
  { href: '/transactions', label: 'Transactions', icon: '💳' },
  { href: '/canvas', label: 'Canvas', icon: '📋' },
  { href: '/reports', label: 'Reports', icon: '📈' },
]

interface Props {
  userName: string
  userRole: string
}

export default function SidebarNav({ userName, userRole }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col w-64 bg-gray-900 text-white shrink-0">
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-lg">💳</div>
            <div>
              <h1 className="font-bold text-lg leading-tight">SwipeSaaS</h1>
              <p className="text-gray-400 text-xs">Fintech ERP</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
                pathname === item.href || pathname.startsWith(item.href + '/')
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              )}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-700">
          <div className="mb-3 px-2">
            <p className="text-sm font-medium text-white truncate">{userName}</p>
            <span className={cn(
              'text-xs px-2 py-0.5 rounded-full font-medium',
              userRole === 'super_admin' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'
            )}>
              {userRole === 'super_admin' ? 'Super Admin' : 'Sub Admin'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition"
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 flex items-center justify-around px-2 py-2 shadow-lg">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors',
              pathname === item.href ? 'text-blue-600' : 'text-gray-500'
            )}
          >
            <span className="text-lg">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
