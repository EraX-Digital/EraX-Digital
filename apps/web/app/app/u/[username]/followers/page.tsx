'use client'

import { PeopleList } from '../../../../../components/people-list'
import { useParams } from 'next/navigation'

export default function FollowersPage() {
  const params = useParams<{ username: string }>()
  return <PeopleList username={params.username} direction="followers" />
}
