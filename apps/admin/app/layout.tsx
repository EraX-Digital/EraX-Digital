import type { Metadata } from 'next'
import { Manrope, Newsreader } from 'next/font/google'
import '@erax/ui/styles.css'

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' })
const serif = Newsreader({ subsets: ['latin'], variable: '--font-serif' })

export const metadata: Metadata = {
  title: 'EraX Administration',
  description: 'EraX administrator console',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${serif.variable}`}>{children}</body>
    </html>
  )
}
