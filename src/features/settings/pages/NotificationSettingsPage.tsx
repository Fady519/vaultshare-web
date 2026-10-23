import { useQueryClient } from '@tanstack/react-query'
import { SectionMark, SkeletonRows, Toggle, toast } from '@/components'
import { errorMessage } from '@/api/client'
import { settingsApi, settingsKeys, useNotificationSettings } from '@/api/settings'
import type { NotificationSettingDto } from '@/api/types'
import { SettingsLayout } from '../SettingsLayout'
import s from '../settings.module.css'

const GROUPS: { key: NotificationSettingDto['group']; label: string; note?: string }[] = [
  { key: 'security', label: 'Security', note: 'the first three are mandatory' },
  { key: 'sharing', label: 'Sharing' },
  { key: 'vault', label: 'Vault activity' },
]

// figma 46
export default function NotificationSettingsPage() {
  const qc = useQueryClient()
  const settings = useNotificationSettings()

  async function set(item: NotificationSettingDto, enabled: boolean) {
    // flip it right away, the list refetches after
    qc.setQueryData<NotificationSettingDto[]>(settingsKeys.notificationSettings, (list) =>
      list?.map((x) => (x.key === item.key ? { ...x, enabled } : x)),
    )
    try {
      await settingsApi.setNotification(item.key, enabled)
    } catch (err) {
      toast(errorMessage(err), 'danger')
    } finally {
      qc.invalidateQueries({ queryKey: settingsKeys.notificationSettings })
    }
  }

  return (
    <SettingsLayout
      title="Notification settings"
      crumb="Notifications"
      meta="security alerts cannot be switched off  ·  no notification ever carries key material or a file name"
    >
      {settings.isPending && <SkeletonRows rows={6} />}
      {GROUPS.map((g, i) => {
        const items = (settings.data ?? []).filter((x) => x.group === g.key)
        if (!items.length) return null
        return (
          <section key={g.key} className={s.section}>
            <div className={s.sectionHead}>
              <SectionMark num={`0${i + 1}`}>{g.label}</SectionMark>
              {g.note && <span className={s.sectionNote}>{g.note}</span>}
            </div>
            {items.map((item) => (
              <div key={item.key} className={s.row}>
                <div className={s.rowText}>
                  <p className={s.rowTitle}>{item.label}</p>
                  <p className={s.rowSub}>{item.channels}</p>
                </div>
                {item.locked && <span className={s.sectionNote}>REQUIRED</span>}
                <Toggle
                  label={item.label}
                  checked={item.enabled}
                  lockedReason={item.locked ? 'Security alerts are always on' : undefined}
                  onChange={(on) => set(item, on)}
                />
              </div>
            ))}
          </section>
        )
      })}
      <p className={s.note}>
        Emails are sent by the server, so they only ever say who did what — never which file. The
        app fills in file names after it decrypts them.
      </p>
    </SettingsLayout>
  )
}
