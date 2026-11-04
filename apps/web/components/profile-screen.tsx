'use client'

import { ApiClientError } from '@erax/api-client'
import type { ActivityItem, ChainStatus, PostCard, ProfileCommunityCard, ProfileReply, PublicProfileCard } from '@erax/shared-types'
import { Alert, Button, EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { emptyCopy, formatTimestamp } from '../lib/view-model'
import { FeedScreen } from './feed-screen'
import { PostCardView } from './post-card'

type Tab = 'posts' | 'replies' | 'media' | 'likes' | 'communities' | 'activity'

function shortAddress(address: string) {
  if (address.length < 12) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function ProfileScreen({ username }: { username: string }) {
  const [profile, setProfile] = useState<PublicProfileCard | null>(null)
  const [chain, setChain] = useState<ChainStatus | null>(null)
  const [tab, setTab] = useState<Tab>('posts')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState('')
  const [replies, setReplies] = useState<ProfileReply[] | null>(null)
  const [media, setMedia] = useState<PostCard[] | null>(null)
  const [likes, setLikes] = useState<PostCard[] | null>(null)
  const [communities, setCommunities] = useState<ProfileCommunityCard[] | null>(null)
  const [activity, setActivity] = useState<ActivityItem[] | null>(null)

  async function loadProfile() {
    const next = await api.socialProfile(username)
    setProfile(next)
    return next
  }

  useEffect(() => {
    setProfile(null)
    setTab('posts')
    setError(null)
    loadProfile().catch((caught: unknown) =>
      setError(caught instanceof Error ? caught.message : 'Profile could not be loaded'),
    )
    api.chainStatus().then(setChain).catch(() => setChain(null))
  }, [username])

  useEffect(() => {
    if (!profile) return
    setError(null)
    if (tab === 'replies') {
      setReplies(null)
      api
        .profileReplies(profile.username)
        .then((page) => setReplies(page.items))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Replies could not be loaded'))
    }
    if (tab === 'media') {
      setMedia(null)
      api
        .profileMedia(profile.username)
        .then((page) => setMedia(page.items))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Media could not be loaded'))
    }
    if (tab === 'likes' && profile.viewer.isSelf) {
      setLikes(null)
      api
        .profileLikes(profile.username)
        .then((page) => setLikes(page.items))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Likes could not be loaded'))
    }
    if (tab === 'communities') {
      setCommunities(null)
      api
        .profileCommunities(profile.username)
        .then((page) => setCommunities(page.items))
        .catch((caught: unknown) =>
          setError(caught instanceof Error ? caught.message : 'Communities could not be loaded'),
        )
    }
    if (tab === 'activity' && profile.viewer.isSelf) {
      setActivity(null)
      api
        .profileActivity(profile.username)
        .then((page) => setActivity(page.items))
        .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Activity could not be loaded'))
    }
  }, [tab, profile?.username, profile?.viewer.isSelf])

  async function toggleFollow() {
    if (!profile) return
    try {
      await api.follow(profile.username, !profile.viewer.following)
      await loadProfile()
      setError(null)
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Follow update failed')
    }
  }

  async function toggleBlock() {
    if (!profile) return
    try {
      await api.block(profile.username, !profile.viewer.blocked)
      await loadProfile()
      setNotice(profile.viewer.blocked ? 'Unblocked.' : 'Blocked. Their posts and messages stay hidden.')
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Block update failed')
    }
  }

  async function copyUrl() {
    if (!profile) return
    const url = `${window.location.origin}/app/u/${profile.username}`
    try {
      await navigator.clipboard.writeText(url)
      setNotice('Profile link copied.')
    } catch {
      setNotice(url)
    }
  }

  if (!profile && !error) {
    return (
      <div className="erax-card" aria-hidden="true">
        <div className="erax-skeleton erax-skeleton-cover" />
        <div className="erax-skeleton" />
        <div className="erax-skeleton erax-skeleton-short" />
      </div>
    )
  }
  if (!profile) return <Alert>{error}</Alert>

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'posts', label: 'Posts' },
    { id: 'replies', label: 'Replies' },
    { id: 'media', label: 'Media' },
    { id: 'communities', label: 'Communities' },
  ]
  if (profile.viewer.isSelf) {
    tabs.push({ id: 'likes', label: 'Likes' }, { id: 'activity', label: 'Activity' })
  }

  return (
    <>
      <header className="erax-profile">
        {profile.coverUrl ? <img className="erax-cover" alt="" src={profile.coverUrl} /> : <div className="erax-cover erax-cover-empty" />}
        <div className="erax-profile-row">
          {profile.avatarUrl ? (
            <img className="erax-avatar" alt="" src={profile.avatarUrl} />
          ) : (
            <span className="erax-avatar erax-avatar-fallback" aria-hidden="true">
              {profile.displayName.slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1>{profile.displayName}</h1>
            <p className="erax-muted">@{profile.username}</p>
          </div>
        </div>
        {profile.creatorStatus === 'creator' ? (
          <p className="erax-pill">Self-declared creator. This is not an on-chain registration.</p>
        ) : null}
        <p>{profile.bio || 'No biography.'}</p>
        <p className="erax-muted">
          <a href={`/app/u/${profile.username}/followers`}>{profile.stats.followers} followers</a>
          {' · '}
          <a href={`/app/u/${profile.username}/following`}>{profile.stats.following} following</a>
          {' · '}
          {profile.stats.posts} posts
          {profile.viewer.mutualCount > 0 ? (
            <>
              {' · '}
              <a href={`/app/u/${profile.username}/mutuals`}>{profile.viewer.mutualCount} mutual</a>
            </>
          ) : null}
        </p>
        <p className="erax-muted">Joined {formatTimestamp(profile.joinedAt)}</p>
        {profile.location ? <p>{profile.location}</p> : null}
        {profile.website ? (
          <p>
            <a href={profile.website}>{profile.website}</a>
          </p>
        ) : null}
        {profile.socialLinks.map((link) => (
          <p key={link.url}>
            <a href={link.url}>{link.label}</a>
          </p>
        ))}
        <section className="erax-card">
          <h2>Wallets</h2>
          {profile.linkedWallets.length === 0 ? (
            <p className="erax-muted">No signature-verified wallet is linked. Social features do not require one.</p>
          ) : (
            <ul className="erax-list">
              {profile.linkedWallets.map((wallet) => (
                <li key={`${wallet.chainFamily}-${wallet.address}`}>
                  <span className="erax-pill">{wallet.chainFamily}</span> {wallet.network}{' '}
                  <span className="erax-address">{shortAddress(wallet.address)}</span>
                  <span className="erax-muted"> · signature-verified</span>
                </li>
              ))}
            </ul>
          )}
          <p className="erax-muted">
            <a href="/wallet">Manage wallet links</a>
            {' · '}
            <a href="/wallet/creator">Creator registration</a>
          </p>
          <p className="erax-muted">
            {chain?.message ??
              'On-chain creator registration and SOL or ETH tips are not enabled. Program deployments have no recorded signature.'}
            {chain ? ` Indexed program events: ${chain.indexedEventCount}.` : ''}
          </p>
        </section>
        {error ? <Alert>{error}</Alert> : null}
        {notice ? <p className="erax-note">{notice}</p> : null}
        <div className="erax-actions">
          {profile.viewer.isSelf ? (
            <a className="erax-button" href="/app/profile">
              Edit profile
            </a>
          ) : (
            <>
              <Button type="button" onClick={() => void toggleFollow()} disabled={profile.viewer.blocked}>
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
              <button className="erax-button-secondary" type="button" onClick={() => void toggleBlock()}>
                {profile.viewer.blocked ? 'Unblock' : 'Block'}
              </button>
              <button className="erax-button-secondary" type="button" onClick={() => setReportOpen((value) => !value)}>
                Report
              </button>
            </>
          )}
          <button className="erax-button-secondary" type="button" onClick={() => void copyUrl()}>
            Share
          </button>
        </div>
        {reportOpen ? (
          <form
            className="erax-form"
            onSubmit={(event) => {
              event.preventDefault()
              void api
                .report({ targetType: 'profile', targetId: profile.username, reason: reportReason.trim() })
                .then(() => {
                  setNotice('Report saved. This version does not hide the profile automatically.')
                  setReportReason('')
                  setReportOpen(false)
                })
                .catch((caught: unknown) =>
                  setError(caught instanceof ApiClientError ? caught.message : 'Report failed'),
                )
            }}
          >
            <label className="erax-field">
              <span>Why are you reporting this profile?</span>
              <textarea
                value={reportReason}
                maxLength={500}
                onChange={(event) => setReportReason(event.target.value)}
              />
            </label>
            <Button type="submit">Submit report</Button>
          </form>
        ) : null}
      </header>
      <div className="erax-tabs" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'erax-tab erax-tab-active' : 'erax-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === 'posts' ? <FeedScreen kind="profile" username={profile.username} /> : null}
      {tab === 'replies' && replies === null ? <p className="erax-muted">Loading replies…</p> : null}
      {tab === 'replies' && replies && replies.length === 0 ? (
        <EmptyState title={emptyCopy('replies').title} body={emptyCopy('replies').body} />
      ) : null}
      {tab === 'replies'
        ? replies?.map((reply) => (
            <article key={reply.id} className="erax-card">
              <p className="erax-post-body">{reply.body}</p>
              <p className="erax-muted">
                <a href={`/app/posts/${reply.postId}`}>View post</a>
              </p>
            </article>
          ))
        : null}
      {tab === 'media' && media === null ? <p className="erax-muted">Loading media…</p> : null}
      {tab === 'media' && media && media.length === 0 ? (
        <EmptyState title={emptyCopy('media').title} body={emptyCopy('media').body} />
      ) : null}
      {tab === 'media'
        ? media?.map((post) => <PostCardView key={post.id} post={post} />)
        : null}
      {tab === 'likes' && likes === null ? <p className="erax-muted">Loading likes…</p> : null}
      {tab === 'likes' && likes && likes.length === 0 ? (
        <EmptyState title={emptyCopy('likes').title} body={emptyCopy('likes').body} />
      ) : null}
      {tab === 'likes' ? likes?.map((post) => <PostCardView key={post.id} post={post} />) : null}
      {tab === 'communities' && communities === null ? <p className="erax-muted">Loading communities…</p> : null}
      {tab === 'communities' && communities && communities.length === 0 ? (
        <EmptyState title="No communities" body="Public communities this account belongs to will appear here." />
      ) : null}
      {tab === 'communities' ? (
        <ul className="erax-list">
          {communities?.map((community) => (
            <li key={community.slug} className="erax-card">
              <a href={`/app/communities/${community.slug}`}>
                <strong>{community.name}</strong>
              </a>
              <p className="erax-muted">
                {community.role} · {community.memberCount} members · {community.visibility}
              </p>
              <p>{community.description}</p>
            </li>
          ))}
        </ul>
      ) : null}
      {tab === 'activity' && activity === null ? <p className="erax-muted">Loading activity…</p> : null}
      {tab === 'activity' && activity && activity.length === 0 ? (
        <EmptyState title="No activity yet" body="Posts, replies, and follows from this account show up here." />
      ) : null}
      {tab === 'activity' ? (
        <ul className="erax-list">
          {activity?.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <a href={item.href}>{item.label}</a>
              <span className="erax-muted"> · {item.kind}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  )
}
