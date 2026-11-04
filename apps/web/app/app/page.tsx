'use client'

import { useState } from 'react'
import { FeedScreen } from '../../components/feed-screen'

const kinds = [
  ['following', 'Following'],
  ['discover', 'Discover'],
  ['media', 'Media'],
] as const

export default function AccountHomePage() {
  const [kind, setKind] = useState<(typeof kinds)[number][0]>('following')
  return (
    <>
      <p className="erax-kicker">EraX Social</p>
      <h1>Home</h1>
      <p className="erax-muted">
        Following shows posts from you and people you follow. Discover and Media list public posts. Nothing
        here is a trending rank, and posting does not require a wallet.
      </p>
      <div className="erax-tabs" role="tablist">
        {kinds.map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={kind === value}
            className={kind === value ? 'erax-tab erax-tab-active' : 'erax-tab'}
            onClick={() => setKind(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <FeedScreen kind={kind} />
    </>
  )
}
