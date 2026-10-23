import { useQueryClient } from '@tanstack/react-query'
import { Menu, toast } from '@/components'
import { adminApi } from '@/api/admin'
import { errorMessage } from '@/api/client'
import type { SystemRole, UserStatus } from '@/api/types'

type Props = { userId: string; name: string; status: UserStatus; systemRole: SystemRole }

// the admin's "⋮" on a person: suspend / reactivate, change the system role
export function UserActions({ userId, name, status, systemRole }: Props) {
  const qc = useQueryClient()

  async function update(body: { status?: UserStatus; systemRole?: SystemRole }, done: string) {
    try {
      await adminApi.updateUser(userId, body)
      toast(done, 'ok')
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: ['team'] })
      qc.invalidateQueries({ queryKey: ['admin'] })
    }
  }

  const roles: SystemRole[] = ['user', 'auditor', 'admin']
  return (
    <Menu
      label={`Actions for ${name}`}
      items={[
        status === 'disabled'
          ? {
              label: 'Reactivate',
              onSelect: () => update({ status: 'active' }, `${name} can sign in again.`),
            }
          : {
              label: 'Suspend',
              danger: true,
              onSelect: () =>
                update({ status: 'disabled' }, `${name} is suspended and signed out everywhere.`),
            },
        ...roles
          .filter((r) => r !== systemRole)
          .map((r) => ({
            label: r === 'user' ? 'Make a regular member' : `Make ${r}`,
            onSelect: () =>
              update({ systemRole: r }, `${name} is now ${r === 'user' ? 'a member' : `an ${r}`}.`),
          })),
      ]}
    />
  )
}
