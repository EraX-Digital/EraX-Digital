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
    <html lang="en" suppressHydrationWarning>
      <body className={`${sans.variable} ${serif.variable}`}>
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
