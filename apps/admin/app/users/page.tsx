'use client'

import { ApiClientError } from '@erax/api-client'
import { Button, EmptyState } from '@erax/ui'
import { useEffect, useState } from 'react'
import { AdminShell } from '../admin-shell'
import { api } from '../../lib/api'

type UserRow = Awaited<ReturnType<typeof api.adminUsers>>['users'][number]

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const result = await api.adminUsers()
    setUsers(result.users)
  }

  useEffect(() => {
    load().catch((caught: unknown) => {
      if (caught instanceof ApiClientError && (caught.status === 401 || caught.status === 403))
        return
      setError(caught instanceof Error ? caught.message : 'Users could not be loaded')
    })
  }, [])

  async function changeStatus(user: UserRow) {
    setError(null)
    try {
      await api.setUserStatus(user.id, user.status === 'active' ? 'suspended' : 'active')
      await load()
    } catch (caught) {
      setError(caught instanceof ApiClientError ? caught.message : 'Status update failed')
    }
  }

  return (
    <main className="erax-shell">
      <AdminShell>
        <h1>Users</h1>
        {error ? <p role="alert">{error}</p> : null}
        {users && users.length === 0 ? (
          <EmptyState title="No users" body="No accounts have been created." />
        ) : null}
        {users && users.length > 0 ? (
          <table className="erax-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.username}</td>
                  <td>{user.email}</td>
                  <td>{user.role}</td>
                  <td>{user.status}</td>
                  <td>
                    <Button type="button" onClick={() => void changeStatus(user)}>
                      {user.status === 'active' ? 'Suspend' : 'Reactivate'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </AdminShell>
    </main>
  )
}
