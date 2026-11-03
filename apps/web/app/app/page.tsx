'use client'

import { FeedScreen } from '../../components/feed-screen'

export default function AccountHomePage() {
  return (
    <>
      <p className="erax-kicker">EraX Social</p>
      <h1>Home</h1>
      <p className="erax-muted">
        Posts from you and people you follow, newest first. Wallet connection is not part of posting.
      </p>
      <FeedScreen kind="following" />
    </>
  )
}
