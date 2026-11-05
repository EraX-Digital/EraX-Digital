import type { Metadata } from 'next'
import { Cormorant_Garamond, JetBrains_Mono, Manrope } from 'next/font/google'
import '@erax/ui/styles.css'

const sans = Manrope({ subsets: ['latin'], variable: '--font-sans' })
const serif = Cormorant_Garamond({ subsets: ['latin'], weight: ['500', '600'], variable: '--font-serif' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'EraX Administration',
  description: 'EraX administrator console',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
