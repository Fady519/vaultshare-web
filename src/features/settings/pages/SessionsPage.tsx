import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Button, SectionMark, SkeletonRows, Tag, toast } from '@/components'
import { errorMessage } from '@/api/client'
import { settingsApi, settingsKeys, useSessions } from '@/api/settings'
import type { SessionDto } from '@/api/types'
import { useSession, idleMinutesOf } from '@/store/session'
import { cx } from '@/utils/cx'
import { formatDate, timeAgo } from '@/utils/format'
import { signOut } from '@/features/auth/session'
import { SettingsLayout } from '../SettingsLayout'
import s from '../settings.module.css'
import styles from './SessionsPage.module.css'

const DAY = 86_400_000

function stateOf(x: SessionDto): { tag: string; tone: 'accent' | 'warn' | 'neutral'; dot: string } {
  if (x.current) return { tag: 'Current', tone: 'accent', dot: styles.on }
  if (Date.now() - new Date(x.firstSeenAt).getTime() < DAY) {
    return { tag: 'New device', tone: 'warn', dot: styles.new }
  }
  if (Date.now() - new Date(x.lastActiveAt).getTime() > 3 * DAY) {
    return { tag: 'Idle', tone: 'neutral', dot: styles.idle }
  }
  return { tag: x.trusted ? 'Trusted' : 'Active', tone: 'neutral', dot: styles.on }
}

// figma 44
export default function SessionsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const user = useSession((st) => st.user)
  const sessions = useSessions()
  const [busy, setBusy] = useState<string | null>(null)
  const list = sessions.data ?? []

  async function revoke(id: string) {
    setBusy(id)
    try {
      if (id === 'all') {
        await settingsApi.revokeOtherSessions()
        toast('Every other session is signed out.', 'ok')
      } else {
        await settingsApi.revokeSession(id)
        toast('Session revoked. That device has to sign in again.', 'ok')
      }
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      setBusy(null)
      qc.invalidateQueries({ queryKey: settingsKeys.sessions })
      qc.invalidateQueries({ queryKey: settingsKeys.security })
    }
  }

  return (
    <SettingsLayout
      title="Sessions and devices"
      crumb="Sessions"
      meta={`${list.length} active session${list.length === 1 ? '' : 's'}  ·  access tokens live 10 minutes  ·  the refresh token rotates on every use`}
      actions={
        <Button
          variant="danger"
          loading={busy === 'all'}
          disabled={list.filter((x) => !x.current).length === 0}
          onClick={() => revoke('all')}
        >
          Sign out everywhere else
        </Button>
      }
    >
      <section className={s.section}>
        <div className={s.sectionHead}>
          <SectionMark num="01">Active sessions</SectionMark>
          <span className={s.sectionNote}>
            revoking kills the refresh token family, not just a cookie
          </span>
        </div>
        {sessions.isPending && <SkeletonRows rows={3} />}
        {list.map((x) => {
          const st = stateOf(x)
          return (
            <div key={x.id} className={s.row}>
              <span className={cx(styles.dot, st.dot)} aria-hidden />
              <div className={s.rowText}>
                <p className={s.rowTitle}>{x.device}</p>
                <p className={s.rowSub}>
                  {x.ipMasked} · {x.location}
                  {x.current
                    ? ' · this device'
                    : ` · last used ${timeAgo(x.lastActiveAt).toLowerCase()}`}
                </p>
                <p className={s.rowSub}>
                  first seen {formatDate(x.firstSeenAt)} · refresh expires{' '}
                  {formatDate(x.refreshExpiresAt)}
                  {x.trusted ? ' · remembered' : ''}
                </p>
              </div>
              <Tag tone={st.tone}>{st.tag}</Tag>
              {x.current ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    await signOut()
                    navigate('/signin')
                  }}
                >
                  Sign out
                </Button>
              ) : (
                <Button
                  variant="danger"
                  size="sm"
                  loading={busy === x.id}
                  onClick={() => revoke(x.id)}
                >
                  Revoke
                </Button>
              )}
            </div>
          )
        })}
      </section>

      <section className={s.section}>
        <SectionMark num="02">Token policy</SectionMark>
        <div className={s.cards}>
          <div className={s.card}>
            <span className={s.cardLabel}>Access token</span>
            <span className={s.cardValue}>10 minutes</span>
            <span className={s.cardSub}>kept in memory only · never stores key material</span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Refresh token</span>
            <span className={s.cardValue}>14 days</span>
            <span className={s.cardSub}>
              rotates on use · a reused one revokes the whole family
            </span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Step-up window</span>
            <span className={s.cardValue}>5 minutes</span>
            <span className={s.cardSub}>per action: sharing, roles, links, keys</span>
          </div>
          <div className={s.card}>
            <span className={s.cardLabel}>Idle lock</span>
            <span className={s.cardValue}>{idleMinutesOf(user)} minutes</span>
            <span className={s.cardSub}>the private key is wiped from memory</span>
          </div>
        </div>
      </section>
    </SettingsLayout>
  )
}
