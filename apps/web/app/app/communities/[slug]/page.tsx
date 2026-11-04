'use client'

import { ApiClientError } from '@erax/api-client'
import { Alert, Button, TextField } from '@erax/ui'
import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { FeedScreen } from '../../../../components/feed-screen'
import { api } from '../../../../lib/api'

type Community = {
  id: string
  name: string
  slug: string
  description: string
  rules: string
  visibility: 'public' | 'private'
  memberCount: number
  coverUrl: string | null
  viewerRole: 'owner' | 'moderator' | 'member' | null
}

export default function CommunityPage() {
  const params = useParams<{ slug: string }>()
  const slug = params.slug
  const [community, setCommunity] = useState<Community | null>(null)
  const [members, setMembers] = useState<Array<{ username: string; displayName: string; role: string }>>([])
  const [error, setError] = useState<string | null>(null)
  const [invitee, setInvitee] = useState('')

  async function load() {
    const [detail, people] = await Promise.all([api.community(slug), api.communityMembers(slug)])
    setCommunity(detail)
    setMembers(people.items)
  }

  useEffect(() => {
    load().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Community could not be loaded'),
    )
  }, [slug])

  async function act(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'That action failed')
    }
  }

  if (!community && !error) return <p className="erax-muted">Loading community…</p>
  if (!community) return <Alert>{error}</Alert>

  return (
    <>
      {community.coverUrl ? <img className="erax-cover" alt="" src={community.coverUrl} /> : null}
      <h1>{community.name}</h1>
      <p>{community.description || 'No description.'}</p>
      {community.rules ? (
        <section className="erax-card">
          <h2>Rules</h2>
          <p className="erax-post-body">{community.rules}</p>
        </section>
      ) : (
        <p className="erax-muted">No rules have been written.</p>
      )}
      <p className="erax-muted">
        {community.visibility} · {community.memberCount} members
      </p>
      {error ? <Alert>{error}</Alert> : null}
      <div className="erax-actions">
        {community.viewerRole ? null : (
          <Button type="button" onClick={() => void act(() => api.joinCommunity(slug))}>
            Join
          </Button>
        )}
        {community.viewerRole && community.viewerRole !== 'owner' ? (
          <Button type="button" onClick={() => void act(() => api.leaveCommunity(slug))}>
            Leave
          </Button>
        ) : null}
        {community.viewerRole === 'owner' || community.viewerRole === 'moderator' ? (
          <a className="erax-button-secondary" href={`/app/communities/${slug}/manage`}>
            Manage
          </a>
        ) : null}
      </div>
      {community.viewerRole === 'owner' || community.viewerRole === 'moderator' ? (
        <form
          className="erax-form"
          onSubmit={(event) => {
            event.preventDefault()
            void act(() => api.invite(slug, invitee))
          }}
        >
          <TextField label="Invite a username" value={invitee} onChange={(event) => setInvitee(event.target.value)} />
          <Button type="submit">Invite</Button>
        </form>
      ) : null}
      <h2>Members</h2>
      <ul className="erax-list">
        {members.map((member) => (
          <li key={member.username}>
            <a href={`/app/u/${member.username}`}>
              {member.displayName} @{member.username}
            </a>{' '}
            <span className="erax-muted">{member.role}</span>
            {community.viewerRole === 'owner' || (community.viewerRole === 'moderator' && member.role === 'member') ? (
              member.role === 'owner' ? null : (
                <button type="button" onClick={() => void act(() => api.removeMember(slug, member.username))}>
                  Remove
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {community.viewerRole ? <FeedScreen kind="community" communityId={community.id} communitySlug={slug} /> : null}
    </>
  )
}
