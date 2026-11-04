'use client'

import { useEffect, useState } from 'react'

const storageKey = 'erax-theme'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey)
    if (stored === 'light' || stored === 'dark') setTheme(stored)
  }, [])

  function choose(next: 'dark' | 'light') {
    setTheme(next)
    if (next === 'dark') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', 'light')
    window.localStorage.setItem(storageKey, next)
  }

  return (
    <div className="erax-theme">
      <button type="button" aria-pressed={theme === 'dark'} onClick={() => choose('dark')}>
        Dark
      </button>
      <button type="button" aria-pressed={theme === 'light'} onClick={() => choose('light')}>
        Light
      </button>
    </div>
  )
}
