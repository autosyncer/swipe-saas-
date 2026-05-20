'use client'
import { useState } from 'react'
import jsPDF from 'jspdf'

export const DownloadBrochureButton = () => {
  const [loading, setLoading] = useState(false)

  const downloadPDF = async () => {
    setLoading(true)
    try {
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = 210
      const pageHeight = 297

      // PAGE 1 — COVER PAGE
      // Green header background
      pdf.setFillColor(62, 207, 142)
      pdf.rect(0, 0, pageWidth, 80, 'F')

      // Logo area
      pdf.setFillColor(255, 255, 255)
      pdf.roundedRect(20, 15, 12, 12, 2, 2, 'F')
      pdf.setTextColor(62, 207, 142)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('S', 24, 24)

      // Company name
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(28)
      pdf.setFont('helvetica', 'bold')
      pdf.text('SwipeSaaS', 20, 50)

      // Tagline
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Complete ERP for Credit Card Swipe Businesses', 20, 62)

      // Sub tagline
      pdf.setFontSize(10)
      pdf.text('Replace Excel Forever — Track, Manage, Grow', 20, 72)

      // White content area
      pdf.setFillColor(249, 249, 249)
      pdf.rect(0, 80, pageWidth, pageHeight - 80, 'F')

      // Headline
      pdf.setTextColor(26, 26, 26)
      pdf.setFontSize(18)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Manage Your Swipe Business', 20, 100)
      pdf.text('Like Never Before', 20, 112)

      // Description
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(107, 114, 128)
      const desc = pdf.splitTextToSize(
        'The complete ERP for credit card swipe operators. Track transactions, manage 50+ accounts, generate professional reports — all from one place. One entry automatically updates all 5 sheets simultaneously.',
        170
      )
      pdf.text(desc, 20, 125)

      // Stats boxes
      const stats = [
        { label: 'Swipe Operators', value: '50+' },
        { label: 'Transactions Tracked', value: '₹10Cr+' },
        { label: 'Sheets Auto-Updated', value: '5' },
        { label: 'Uptime', value: '99.9%' },
      ]

      stats.forEach((stat, i) => {
        const x = 20 + (i * 43)
        pdf.setFillColor(255, 255, 255)
        pdf.roundedRect(x, 148, 38, 22, 2, 2, 'F')
        pdf.setDrawColor(229, 231, 235)
        pdf.roundedRect(x, 148, 38, 22, 2, 2, 'S')
        pdf.setTextColor(62, 207, 142)
        pdf.setFontSize(14)
        pdf.setFont('helvetica', 'bold')
        pdf.text(stat.value, x + 19, 158, { align: 'center' })
        pdf.setTextColor(107, 114, 128)
        pdf.setFontSize(7)
        pdf.setFont('helvetica', 'normal')
        pdf.text(stat.label, x + 19, 165, { align: 'center' })
      })

      // Problem vs Solution
      pdf.setTextColor(26, 26, 26)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Still Managing in Excel?', 20, 185)

      // Problems column
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(239, 68, 68)
      pdf.text('BEFORE SwipeSaaS', 20, 196)

      const problems = [
        'Manually copying to 5 different sheets',
        'Missing commissions, wrong calculations',
        'No visibility on account balances',
        'Spending 2+ hours on data entry daily',
        'Excel crashes and data loss',
        'No alerts for card due dates',
      ]
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(107, 114, 128)
      problems.forEach((p, i) => {
        pdf.setTextColor(239, 68, 68)
        pdf.text('x', 20, 204 + (i * 8))
        pdf.setTextColor(107, 114, 128)
        pdf.text(p, 26, 204 + (i * 8))
      })

      // Solutions column
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(62, 207, 142)
      pdf.text('AFTER SwipeSaaS', 110, 196)

      const solutions = [
        'One entry updates all 5 sheets auto',
        'Commission auto-calculated always',
        'Live balance across all accounts',
        'Entry takes 30 seconds only',
        'Cloud backup — never lose data',
        'Automatic due date reminders',
      ]
      pdf.setFont('helvetica', 'normal')
      solutions.forEach((s, i) => {
        pdf.setTextColor(62, 207, 142)
        pdf.text('v', 110, 204 + (i * 8))
        pdf.setTextColor(107, 114, 128)
        pdf.text(s, 116, 204 + (i * 8))
      })

      // Footer page 1
      pdf.setFillColor(26, 26, 26)
      pdf.rect(0, 282, pageWidth, 15, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text('SwipeSaaS — Complete ERP for Swipe Businesses', 20, 291)
      pdf.text('Page 1 of 3', 190, 291, { align: 'right' })

      // PAGE 2 — FEATURES
      pdf.addPage()

      // Header
      pdf.setFillColor(62, 207, 142)
      pdf.rect(0, 0, pageWidth, 20, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Key Features', 20, 13)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Everything you need to run your swipe business', 100, 13)

      // Feature cards (2 columns)
      const features = [
        {
          title: 'Smart Entry Form',
          desc: 'Type customer name — all details auto-fill. One submit updates Daily Register, AC Sheet, CC Sheet and Customer Sheet simultaneously. Saves 2 hours daily.',
        },
        {
          title: 'Live Sheet Editor',
          desc: 'Excel-style spreadsheet that stays in sync. Edit cells inline. Export to real .xlsx files that open perfectly in Microsoft Excel with correct formatting.',
        },
        {
          title: 'Multi-Account Tracking',
          desc: 'Track 50+ bank accounts with rolling balances. Opening balance auto-carries from previous day. Never lose track of NSS, SKT, RT, KTC or any account.',
        },
        {
          title: 'Customer Card Management',
          desc: 'Store all customer cards securely. Get due date alerts before they miss payments. Track outstanding balance per customer with complete history.',
        },
        {
          title: 'Analytics & Reports',
          desc: 'Daily P&L, commission summaries, customer statements — all with one click. 8 different report types. Export professional Excel reports instantly.',
        },
        {
          title: 'Risk Alerts',
          desc: 'Automatic detection of suspicious patterns. Multiple swipes, high volume, unusual activity — get alerted before problems become serious.',
        },
        {
          title: 'Commodity Calculator',
          desc: 'Calculate commodity quantities from swipe amounts. Set market prices for rice, wheat, sugar and more. Generate invoices automatically.',
        },
        {
          title: 'Auto Backup',
          desc: 'Every transaction backed up to cloud. Daily backup to Google Drive. Weekly full backup to your PC. Never lose your business data.',
        },
      ]

      features.forEach((f, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = col === 0 ? 15 : 110
        const y = 28 + (row * 58)

        // Card background
        pdf.setFillColor(255, 255, 255)
        pdf.roundedRect(x, y, 88, 50, 2, 2, 'F')
        pdf.setDrawColor(229, 231, 235)
        pdf.roundedRect(x, y, 88, 50, 2, 2, 'S')

        // Green top border
        pdf.setFillColor(62, 207, 142)
        pdf.rect(x, y, 88, 2, 'F')

        // Title
        pdf.setTextColor(26, 26, 26)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text(f.title, x + 5, y + 12)

        // Description
        pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(107, 114, 128)
        pdf.setFontSize(8)
        const lines = pdf.splitTextToSize(f.desc, 80)
        pdf.text(lines.slice(0, 4), x + 5, y + 22)
      })

      // Footer page 2
      pdf.setFillColor(26, 26, 26)
      pdf.rect(0, 282, pageWidth, 15, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text('SwipeSaaS — Complete ERP for Swipe Businesses', 20, 291)
      pdf.text('Page 2 of 3', 190, 291, { align: 'right' })

      // PAGE 3 — PRICING + CTA
      pdf.addPage()

      // Header
      pdf.setFillColor(62, 207, 142)
      pdf.rect(0, 0, pageWidth, 20, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(14)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Pricing Plans', 20, 13)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Simple, transparent pricing. No hidden fees.', 100, 13)

      // Pricing cards
      const plans: {
        name: string
        price: string
        period: string
        popular: boolean
        color: [number, number, number]
        borderColor: [number, number, number]
        features: string[]
      }[] = [
        {
          name: 'STARTER',
          price: '2,999',
          period: '/month',
          popular: false,
          color: [249, 250, 251],
          borderColor: [229, 231, 235],
          features: [
            '1 Admin user',
            '500 transactions/month',
            'All 5 core sheets',
            'Basic reports',
            'Email support',
            '14-day free trial',
          ],
        },
        {
          name: 'PRO',
          price: '5,999',
          period: '/month',
          popular: true,
          color: [240, 253, 244],
          borderColor: [62, 207, 142],
          features: [
            '5 Admin users',
            'Unlimited transactions',
            'All features included',
            'All 8 report types',
            'Priority support',
            'Google Drive backup',
          ],
        },
        {
          name: 'BUSINESS',
          price: '9,999',
          period: '/month',
          popular: false,
          color: [249, 250, 251],
          borderColor: [229, 231, 235],
          features: [
            'Unlimited admins',
            'Unlimited transactions',
            'Custom reports',
            'Dedicated support',
            'White label option',
            'Custom integrations',
          ],
        },
      ]

      plans.forEach((plan, i) => {
        const x = 15 + (i * 62)
        const y = 28

        pdf.setFillColor(...plan.color)
        pdf.roundedRect(x, y, 56, 100, 3, 3, 'F')
        pdf.setDrawColor(...plan.borderColor)
        pdf.setLineWidth(plan.popular ? 1.5 : 0.5)
        pdf.roundedRect(x, y, 56, 100, 3, 3, 'S')
        pdf.setLineWidth(0.5)

        if (plan.popular) {
          pdf.setFillColor(62, 207, 142)
          pdf.roundedRect(x + 8, y - 5, 40, 10, 3, 3, 'F')
          pdf.setTextColor(255, 255, 255)
          pdf.setFontSize(7)
          pdf.setFont('helvetica', 'bold')
          pdf.text('MOST POPULAR', x + 28, y + 1, { align: 'center' })
        }

        pdf.setTextColor(26, 26, 26)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text(plan.name, x + 28, y + 14, { align: 'center' })

        if (plan.popular) {
          pdf.setTextColor(62, 207, 142)
        } else {
          pdf.setTextColor(26, 26, 26)
        }
        pdf.setFontSize(18)
        pdf.text('Rs.' + plan.price, x + 28, y + 30, { align: 'center' })

        pdf.setTextColor(107, 114, 128)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        pdf.text(plan.period, x + 28, y + 38, { align: 'center' })

        pdf.setDrawColor(229, 231, 235)
        pdf.line(x + 5, y + 42, x + 51, y + 42)

        plan.features.forEach((feat, fi) => {
          pdf.setTextColor(62, 207, 142)
          pdf.setFontSize(9)
          pdf.text('v', x + 7, y + 50 + (fi * 8))
          pdf.setTextColor(55, 65, 81)
          pdf.setFontSize(7.5)
          pdf.text(feat, x + 13, y + 50 + (fi * 8))
        })
      })

      // Annual discount note
      pdf.setFillColor(254, 249, 195)
      pdf.roundedRect(15, 133, 180, 12, 2, 2, 'F')
      pdf.setTextColor(133, 77, 14)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Save 20% with annual plan — Pay for 10 months, get 12!', 105, 141, { align: 'center' })

      // How it works
      pdf.setTextColor(26, 26, 26)
      pdf.setFontSize(13)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Get Started in 3 Simple Steps', 20, 158)

      const steps = [
        { num: '1', title: 'Sign Up Free', desc: 'Create account, add your customers and bank accounts. Import existing data easily.' },
        { num: '2', title: 'Enter Transactions', desc: 'Use the smart entry form. All 5 sheets update automatically with each entry.' },
        { num: '3', title: 'Track & Grow', desc: 'Monitor balances, collect commissions, generate reports and scale your business.' },
      ]

      steps.forEach((step, i) => {
        const x = 15 + (i * 62)
        pdf.setFillColor(62, 207, 142)
        pdf.circle(x + 8, 170, 6, 'F')
        pdf.setTextColor(255, 255, 255)
        pdf.setFontSize(10)
        pdf.setFont('helvetica', 'bold')
        pdf.text(step.num, x + 8, 173, { align: 'center' })

        pdf.setTextColor(26, 26, 26)
        pdf.setFontSize(9)
        pdf.text(step.title, x + 18, 170)

        pdf.setTextColor(107, 114, 128)
        pdf.setFontSize(8)
        pdf.setFont('helvetica', 'normal')
        const lines = pdf.splitTextToSize(step.desc, 50)
        pdf.text(lines, x + 18, 177)
      })

      // CTA Section
      pdf.setFillColor(26, 26, 26)
      pdf.roundedRect(15, 205, 180, 45, 4, 4, 'F')

      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(16)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Ready to Transform Your Business?', 105, 222, { align: 'center' })

      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(156, 163, 175)
      pdf.text('Join 50+ swipe operators who replaced Excel with SwipeSaaS', 105, 231, { align: 'center' })

      // CTA Button
      pdf.setFillColor(62, 207, 142)
      pdf.roundedRect(65, 235, 80, 10, 3, 3, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Start Free 14-Day Trial', 105, 242, { align: 'center' })

      // Contact info
      pdf.setFillColor(249, 249, 249)
      pdf.rect(0, 255, pageWidth, 25, 'F')
      pdf.setTextColor(107, 114, 128)
      pdf.setFontSize(9)
      pdf.setFont('helvetica', 'bold')
      pdf.text('Contact Us', 105, 264, { align: 'center' })
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.text('support@swipesaas.com', 50, 272, { align: 'center' })
      pdf.text('www.swipesaas.com', 105, 272, { align: 'center' })
      pdf.text('+91 98765 43210', 160, 272, { align: 'center' })

      // Footer page 3
      pdf.setFillColor(26, 26, 26)
      pdf.rect(0, 282, pageWidth, 15, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFontSize(8)
      pdf.text('SwipeSaaS — Complete ERP for Swipe Businesses', 20, 291)
      pdf.text('Page 3 of 3', 190, 291, { align: 'right' })

      pdf.save('SwipeSaaS_Brochure.pdf')

    } catch (err) {
      console.error('PDF generation error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={downloadPDF}
      disabled={loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: loading ? '#9ca3af' : '#1a1a1a',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        padding: '12px 24px',
        fontSize: '14px',
        fontWeight: 'bold',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
      }}
    >
      {loading ? <>&#9203; Generating PDF...</> : <>&#128196; Download Brochure PDF</>}
    </button>
  )
}
