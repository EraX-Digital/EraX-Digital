'use client'

import { ApiClientError } from '@erax/api-client'
import type { PublicProfileCard } from '@erax/shared-types'
import { Alert, Button } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FeedScreen } from '../../../../components/feed-screen'
import { api } from '../../../../lib/api'

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>()
  const username = params.username
  const [profile, setProfile] = useState<PublicProfileCard | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setProfile(await api.socialProfile(username))
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Profile could not be loaded'),
    )
  }, [username])

  async function toggleFollow() {
    if (!profile) return
    try {
      await api.follow(profile.username, !profile.viewer.following)
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Follow update failed')
    }
  }

  if (!profile && !error) return <p className="erax-muted">Loading profile…</p>
  if (!profile) return <Alert>{error}</Alert>

  return (
    <>
      {profile.coverUrl ? <img className="erax-cover" alt="" src={profile.coverUrl} /> : null}
      <h1>{profile.displayName}</h1>
      <p className="erax-muted">@{profile.username}</p>
      {profile.creatorStatus === 'creator' ? <p className="erax-pill">Self-declared creator</p> : null}
      <p>{profile.bio || 'No biography.'}</p>
      <p className="erax-muted">
        {profile.stats.posts} posts · {profile.stats.followers} followers · {profile.stats.following} following
      </p>
      <p className="erax-muted">Joined {new Date(profile.joinedAt).toLocaleDateString()}</p>
      {profile.location ? <p>{profile.location}</p> : null}
      {profile.website ? <p><a href={profile.website}>{profile.website}</a></p> : null}
      {profile.socialLinks.map((link) => (
        <p key={link.url}>
          <a href={link.url}>{link.label}</a>
        </p>
      ))}
      <p className="erax-muted">
        Linked wallets: {profile.linkedWallets.length === 0 ? 'none verified' : profile.linkedWallets.map((wallet) => wallet.address).join(', ')}
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <div className="erax-actions">
        {profile.viewer.isSelf ? (
          <a className="erax-button" href="/app/profile">
            Edit profile
          </a>
        ) : (
          <>
            <Button type="button" onClick={() => void toggleFollow()}>
              {profile.viewer.following ? 'Unfollow' : 'Follow'}
            </Button>
            <Button
              type="button"
              onClick={() =>
                void api
                  .openConversation(profile.username)
                  .then((conversation) => {
                    window.location.href = `/app/messages/${conversation.id}`
                  })
                  .catch((caught: unknown) =>
                    setError(caught instanceof ApiClientError ? caught.message : 'Conversation was not opened'),
                  )
              }
            >
              Message
            </Button>
            <Button
              type="button"
              onClick={() =>
                void api
                  .block(profile.username, true)
                  .then(() => setError('Blocked. Their posts and messages are hidden.'))
                  .catch((caught: unknown) =>
                    setError(caught instanceof ApiClientError ? caught.message : 'Block failed'),
                  )
              }
            >
              Block
            </Button>
          </>
        )}
      </div>
      <FeedScreen kind="profile" username={profile.username} />
    </>
  )
}
