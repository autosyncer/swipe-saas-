import Link from 'next/link'
import { DownloadBrochureButton } from '@/components/PDFExport'

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', background: '#0a0a0a', color: '#ffffff', minHeight: '100vh' }}>

      {/* NAV */}
      <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 48px', borderBottom: '1px solid #1e1e1e', position: 'sticky', top: 0, background: 'rgba(10,10,10,0.95)', backdropFilter: 'blur(8px)', zIndex: 50 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: 32, height: 32, background: '#3ECF8E', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 16, color: '#0a0a0a' }}>S</div>
          <span style={{ fontWeight: 700, fontSize: 18 }}>SwipeSaaS</span>
        </div>
        <div style={{ display: 'flex', gap: '32px', fontSize: 14, color: '#9ca3af' }}>
          <a href="#features" style={{ color: '#9ca3af', textDecoration: 'none' }}>Features</a>
          <a href="#pricing" style={{ color: '#9ca3af', textDecoration: 'none' }}>Pricing</a>
          <a href="#about" style={{ color: '#9ca3af', textDecoration: 'none' }}>About</a>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ fontSize: 14, color: '#9ca3af', textDecoration: 'none' }}>Login</Link>
          <Link href="/dashboard" style={{ background: '#3ECF8E', color: '#0a0a0a', padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Get Started
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ textAlign: 'center', padding: '100px 24px 80px', maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'inline-block', background: 'rgba(62,207,142,0.1)', color: '#3ECF8E', border: '1px solid rgba(62,207,142,0.3)', borderRadius: 999, padding: '6px 16px', fontSize: 12, fontWeight: 600, marginBottom: 24 }}>
          Trusted by 50+ Swipe Operators
        </div>
        <h1 style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.15, marginBottom: 24, letterSpacing: -1 }}>
          Replace Excel.<br />
          <span style={{ color: '#3ECF8E' }}>Run Smarter.</span>
        </h1>
        <p style={{ fontSize: 18, color: '#9ca3af', lineHeight: 1.7, marginBottom: 40, maxWidth: 560, margin: '0 auto 40px' }}>
          The complete ERP for credit card swipe businesses. One entry auto-updates all 5 sheets. Track commissions, manage 50+ accounts, never miss a payment.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href="/dashboard" style={{ background: '#3ECF8E', color: '#0a0a0a', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Start Free 14-Day Trial
          </Link>
          <Link href="/dashboard" style={{ background: '#1a1a1a', color: '#ffffff', border: '1px solid #2a2a2a', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 600, textDecoration: 'none' }}>
            Watch Demo
          </Link>
          <DownloadBrochureButton />
        </div>
        <p style={{ fontSize: 12, color: '#6b7280', marginTop: 16 }}>No credit card required · Cancel anytime</p>
      </section>

      {/* STATS */}
      <section style={{ display: 'flex', justifyContent: 'center', gap: '48px', padding: '40px 24px', borderTop: '1px solid #1e1e1e', borderBottom: '1px solid #1e1e1e', flexWrap: 'wrap' }}>
        {[
          { value: '50+', label: 'Swipe Operators' },
          { value: '₹10Cr+', label: 'Transactions Tracked' },
          { value: '5', label: 'Sheets Auto-Updated' },
          { value: '99.9%', label: 'Uptime' },
        ].map(stat => (
          <div key={stat.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#3ECF8E' }}>{stat.value}</div>
            <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>{stat.label}</div>
          </div>
        ))}
      </section>

      {/* PROBLEM / SOLUTION */}
      <section style={{ padding: '80px 48px', maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Still Managing in Excel?</h2>
        <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 16, marginBottom: 56 }}>Here&apos;s what changes when you switch to SwipeSaaS</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 16, padding: 32 }}>
            <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✗</span> BEFORE SwipeSaaS
            </div>
            {[
              'Manually copy to 5 different sheets',
              'Missing commissions & wrong calculations',
              'No visibility on account balances',
              'Spending 2+ hours on data entry daily',
              'Excel crashes and data loss',
              'No alerts for card due dates',
            ].map(p => (
              <div key={p} style={{ display: 'flex', gap: 10, marginBottom: 14, color: '#9ca3af', fontSize: 14, alignItems: 'flex-start' }}>
                <span style={{ color: '#ef4444', marginTop: 1 }}>✗</span>
                {p}
              </div>
            ))}
          </div>
          <div style={{ background: '#0d1f17', border: '1px solid rgba(62,207,142,0.3)', borderRadius: 16, padding: 32 }}>
            <div style={{ color: '#3ECF8E', fontWeight: 700, fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>✓</span> AFTER SwipeSaaS
            </div>
            {[
              'One entry updates all 5 sheets automatically',
              'Commission auto-calculated, always accurate',
              'Live rolling balance across all accounts',
              'Entry takes 30 seconds, not 2 hours',
              'Cloud backup — never lose data again',
              'Automatic due date reminders & alerts',
            ].map(s => (
              <div key={s} style={{ display: 'flex', gap: 10, marginBottom: 14, color: '#9ca3af', fontSize: 14, alignItems: 'flex-start' }}>
                <span style={{ color: '#3ECF8E', marginTop: 1 }}>✓</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: '80px 48px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Everything You Need</h2>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 16, marginBottom: 56 }}>Built specifically for credit card swipe businesses</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { icon: '⚡', title: 'Smart Entry Form', desc: 'Type customer name — all details auto-fill. One submit updates all 5 sheets simultaneously. Saves 2+ hours daily.' },
              { icon: '📊', title: 'Live Sheet Editor', desc: 'Excel-style spreadsheet in real-time. Edit cells inline. Export to proper .xlsx with one click.' },
              { icon: '🏦', title: 'Multi-Account Tracking', desc: 'Track 50+ bank accounts with rolling balances. Opening balance carries automatically every day.' },
              { icon: '💳', title: 'Card Management', desc: 'Store all customer cards, get due date alerts, track outstanding balance per customer with full history.' },
              { icon: '📈', title: 'Analytics & Reports', desc: 'Daily P&L, commission summaries, 8 report types. Export professional Excel reports instantly.' },
              { icon: '🛡️', title: 'Risk Alerts', desc: 'Auto-detect suspicious patterns. Multiple swipes, high volume, unusual activity — get alerted immediately.' },
              { icon: '📦', title: 'Commodity Calculator', desc: 'Calculate commodity quantities, set market prices, generate professional invoices automatically.' },
              { icon: '💾', title: '3-Tier Auto Backup', desc: 'Every transaction to cloud, daily to Google Drive, weekly download to your PC. Zero data loss.' },
              { icon: '👥', title: 'Multi-User Roles', desc: 'Super admin and sub-admin roles. Full audit log of every action. Complete access control.' },
            ].map(f => (
              <div key={f.title} style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 12, padding: 24, borderTop: '3px solid #3ECF8E' }}>
                <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>{f.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 13, lineHeight: 1.6 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Simple Pricing</h2>
          <p style={{ textAlign: 'center', color: '#9ca3af', fontSize: 16, marginBottom: 12 }}>No hidden fees. Cancel anytime.</p>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <span style={{ background: '#fef3c7', color: '#92400e', padding: '6px 16px', borderRadius: 999, fontSize: 13, fontWeight: 600 }}>
              💡 Save 20% with annual plan
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {[
              { name: 'Starter', price: '₹2,999', period: '/month', popular: false, features: ['1 Admin user', '500 transactions/month', 'All 5 core sheets', 'Basic reports', 'Email support', '14-day free trial'] },
              { name: 'Pro', price: '₹5,999', period: '/month', popular: true, features: ['5 Admin users', 'Unlimited transactions', 'All features', 'All 8 report types', 'Priority support', 'Google Drive backup'] },
              { name: 'Business', price: '₹9,999', period: '/month', popular: false, features: ['Unlimited admins', 'Unlimited transactions', 'Custom reports', 'Dedicated support', 'White label option', 'Custom integrations'] },
            ].map(plan => (
              <div key={plan.name} style={{ background: plan.popular ? '#0d1f17' : '#1a1a1a', border: `2px solid ${plan.popular ? '#3ECF8E' : '#2a2a2a'}`, borderRadius: 16, padding: 32, position: 'relative' }}>
                {plan.popular && (
                  <div style={{ position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)', background: '#3ECF8E', color: '#0a0a0a', padding: '4px 16px', borderRadius: 999, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{plan.name}</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: plan.popular ? '#3ECF8E' : '#ffffff', marginBottom: 4 }}>{plan.price}</div>
                <div style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24 }}>{plan.period}</div>
                <div style={{ borderTop: '1px solid #2a2a2a', paddingTop: 24, marginBottom: 24 }}>
                  {plan.features.map(f => (
                    <div key={f} style={{ display: 'flex', gap: 10, marginBottom: 12, fontSize: 14, color: '#d1d5db', alignItems: 'flex-start' }}>
                      <span style={{ color: '#3ECF8E' }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/dashboard" style={{ display: 'block', textAlign: 'center', background: plan.popular ? '#3ECF8E' : '#2a2a2a', color: plan.popular ? '#0a0a0a' : '#ffffff', padding: '12px', borderRadius: 8, fontWeight: 700, textDecoration: 'none', fontSize: 14 }}>
                  Get Started
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ padding: '80px 48px', background: '#0f0f0f' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Get Started in 3 Steps</h2>
          <p style={{ color: '#9ca3af', fontSize: 16, marginBottom: 56 }}>Up and running in under 10 minutes</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {[
              { num: '1', title: 'Sign Up Free', desc: 'Create your account and add customers, cards, and bank accounts.' },
              { num: '2', title: 'Enter Transactions', desc: 'Use the smart form. All 5 sheets update automatically.' },
              { num: '3', title: 'Track & Grow', desc: 'Monitor live balances, run reports, collect commissions.' },
            ].map(step => (
              <div key={step.num} style={{ textAlign: 'center' }}>
                <div style={{ width: 48, height: 48, background: '#3ECF8E', color: '#0a0a0a', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 20, margin: '0 auto 16px' }}>{step.num}</div>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>{step.title}</div>
                <div style={{ color: '#9ca3af', fontSize: 14, lineHeight: 1.6 }}>{step.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BANNER */}
      <section style={{ padding: '80px 48px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 24, padding: '64px 48px' }}>
          <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Ready to Transform Your Business?</h2>
          <p style={{ color: '#9ca3af', fontSize: 16, marginBottom: 40 }}>Join 50+ swipe operators who replaced Excel with SwipeSaaS</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href="/dashboard" style={{ background: '#3ECF8E', color: '#0a0a0a', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>
              Start Free 14-Day Trial
            </Link>
            <DownloadBrochureButton />
          </div>
          <p style={{ fontSize: 12, color: '#6b7280', marginTop: 16 }}>No credit card required</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid #1e1e1e', padding: '40px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: '#3ECF8E', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, color: '#0a0a0a' }}>S</div>
          <span style={{ fontWeight: 700 }}>SwipeSaaS</span>
        </div>
        <div style={{ color: '#6b7280', fontSize: 13 }}>
          © 2025 SwipeSaaS · support@swipesaas.com
        </div>
        <Link href="/dashboard" style={{ background: '#1a1a1a', color: '#9ca3af', border: '1px solid #2a2a2a', padding: '8px 20px', borderRadius: 8, fontSize: 13, textDecoration: 'none' }}>
          Login to Dashboard →
        </Link>
      </footer>

    </div>
  )
}
