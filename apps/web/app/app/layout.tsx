'use client'

import type { PublicProfile, PublicUser } from '@erax/shared-types'
import { ApiClientError } from '@erax/api-client'
import { BrandMark } from '@erax/ui'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'

const links = [
  ['/app', 'Home'],
  ['/wallet', 'Wallet'],
  ['/app/explore', 'Explore'],
  ['/app/communities', 'Communities'],
  ['/app/messages', 'Messages'],
  ['/app/notifications', 'Notifications'],
  ['/app/bookmarks', 'Bookmarks'],
  ['/app/search', 'Search'],
]

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [session, setSession] = useState<{ user: PublicUser; profile: PublicProfile } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [messages, setMessages] = useState(0)

  useEffect(() => {
    let active = true
    api
      .me()
      .then((result) => {
        if (active) setSession(result)
      })
      .catch((caught: unknown) => {
        if (!active) return
        if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403)) {
          router.replace('/login')
          return
        }
        setError(caught instanceof Error ? caught.message : 'Account could not be loaded')
      })
    return () => {
      active = false
    }
  }, [router])

  useEffect(() => {
    if (!session) return
    api
      .notificationSummary()
      .then((summary) => {
        setUnread(summary.unread)
        setMessages(summary.unreadMessages)
      })
      .catch(() => undefined)
  }, [session])

  async function logout() {
    await api.logout()
    router.replace('/')
  }

  if (error) {
    return (
      <main className="erax-shell">
        <p role="alert">{error}</p>
      </main>
    )
  }

  if (!session) {
    return (
      <main className="erax-shell">
        <p className="erax-muted">Checking your session…</p>
      </main>
    )
  }

  return (
    <div className="erax-social">
      <aside className="erax-side">
        <BrandMark href="/app" label="Social" />
        <nav className="erax-side-nav">
          {links.map(([href, label]) => (
            <a key={href} href={href}>
              {label}
              {label === 'Notifications' && unread > 0 ? <span className="erax-badge">{unread}</span> : null}
              {label === 'Messages' && messages > 0 ? <span className="erax-badge">{messages}</span> : null}
            </a>
          ))}
          <a href={`/app/u/${session.profile.username}`}>Profile</a>
          <a href="/app/settings">Settings</a>
        </nav>
        <button className="erax-button" type="button" onClick={() => (window.location.href = '/app')}>
          Create post
        </button>
        <button className="erax-button-secondary" type="button" onClick={() => void logout()}>
          Log out
        </button>
      </aside>
      <main className="erax-main">{children}</main>
      <nav className="erax-bottom-nav">
        <a href="/app">Home</a>
        <a href="/wallet">Wallet</a>
        <a href="/app/explore">Explore</a>
        <a href="/app/communities">Communities</a>
        <a href="/app/messages">Messages</a>
        <a href="/app/notifications">Alerts</a>
      </nav>
    </div>
  )
}
