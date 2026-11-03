'use client'

import { FeedScreen } from '../../../components/feed-screen'

export default function ExplorePage() {
  return (
    <>
      <h1>Explore</h1>
      <p className="erax-muted">Public posts in the order they were published. This is not a trending rank.</p>
      <FeedScreen kind="discover" />
    </>
  )
}
