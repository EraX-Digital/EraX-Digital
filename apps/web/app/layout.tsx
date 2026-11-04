import type { Metadata } from 'next'
import { Golos_Text, JetBrains_Mono, Playfair_Display } from 'next/font/google'
import '@erax/ui/styles.css'

const sans = Golos_Text({ subsets: ['latin'], variable: '--font-sans' })
const serif = Playfair_Display({ subsets: ['latin'], variable: '--font-serif' })
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' })

export const metadata: Metadata = {
  title: 'EraX Digital',
  description: 'Connect. Create. Own.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${serif.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('erax-theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  )
}
