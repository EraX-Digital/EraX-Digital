import type { Metadata } from 'next'
import { Golos_Text, JetBrains_Mono, Playfair_Display } from 'next/font/google'
import '@erax/ui/styles.css'

const sans = Golos_Text({ subsets: ['latin'], variable: '--font-sans' })
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })
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
