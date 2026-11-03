import type { Metadata } from 'next'
import { Manrope, Newsreader } from 'next/font/google'
import '@erax/ui/styles.css'

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' })
const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'EraX Digital',
  description: 'Connect. Create. Own.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  )
}
