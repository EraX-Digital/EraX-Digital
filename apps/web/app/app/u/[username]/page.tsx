'use client'

import { useParams } from 'next/navigation'
import { ProfileScreen } from '../../../../components/profile-screen'

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>()
  return <ProfileScreen username={params.username} />
}
