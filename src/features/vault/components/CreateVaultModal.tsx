import { useState, type FormEvent } from 'react'
import { Avatar, Button, Callout, Modal, SectionMark, Select, Tag, TextField } from '@/components'
import { ApiError, errorMessage } from '@/api/client'
import { lookupUser } from '@/api/me'
import { useCreateVault } from '@/api/vaults'
import type { VaultDto, VaultRole } from '@/api/types'
import { useSession } from '@/store/session'
import styles from './CreateVaultModal.module.css'

type Person = {
  email: string
  displayName: string | null
  fingerprint: string | null
  role: VaultRole
}

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
]

type Props = {
  open: boolean
  onClose: () => void
  onCreated: (vault: VaultDto) => void
}

export function CreateVaultModal({ open, onClose, onCreated }: Props) {
  const me = useSession((s) => s.user)
  const create = useCreateVault()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [email, setEmail] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [looking, setLooking] = useState(false)
  const [nameError, setNameError] = useState('')

  async function addPerson() {
    const value = email.trim().toLowerCase()
    setLookupError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return setLookupError('Enter an email address.')
    if (value === me?.email.toLowerCase()) return setLookupError('You are already the owner.')
    if (people.some((p) => p.email === value)) return setLookupError('Already on the list.')

    setLooking(true)
    try {
      const found = await lookupUser(value)
      setPeople((list) => [
        ...list,
        {
          email: value,
          displayName: found.displayName,
          fingerprint: found.fingerprint,
          role: 'editor',
        },
      ])
      setEmail('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'USER_NOT_FOUND') {
        setPeople((list) => [
          ...list,
          { email: value, displayName: null, fingerprint: null, role: 'editor' },
        ])
        setEmail('')
      } else {
        setLookupError(errorMessage(err))
      }
    } finally {
      setLooking(false)
    }
  }

  function reset() {
    setName('')
    setDescription('')
    setPeople([])
    setEmail('')
    setLookupError('')
    setNameError('')
    create.reset()
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return setNameError('Give the vault a name.')
    try {
      const vault = await create.mutateAsync({
        name: name.trim(),
        description: description.trim(),
        members: people.map((p) => ({ email: p.email, role: p.role })),
      })
      reset()
      onCreated(vault)
    } catch {
      // shown under the form
    }
  }

  function close() {
    reset()
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      width={640}
      title="New vault"
      subtitle="a key ring, not a folder"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form="new-vault" loading={create.isPending}>
            Create vault
          </Button>
        </>
      }
    >
      <form id="new-vault" className={styles.form} onSubmit={submit} noValidate>
        <TextField
          label="Vault name"
          value={name}
          maxLength={200}
          autoFocus
          error={nameError}
          onChange={(e) => {
            setName(e.target.value)
            setNameError('')
          }}
        />
        <TextField
          label="Description"
          placeholder="Quarterly board packs and minutes"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          hint="The server needs the vault name and description to list your vaults, so these two are not encrypted. File names and contents are."
        />

        <SectionMark num="01">Who gets a wrapped key</SectionMark>
        <ul className={styles.people}>
          {me && (
            <li className={styles.person}>
              <Avatar name={me.displayName} size={28} />
              <div className={styles.who}>
                <p>{me.displayName}</p>
                <span>You</span>
              </div>
              <Tag tone="accent">Owner</Tag>
            </li>
          )}
          {people.map((p) => (
            <li key={p.email} className={styles.person}>
              <Avatar name={p.displayName ?? p.email} size={28} />
              <div className={styles.who}>
                <p>{p.displayName ?? p.email}</p>
                <span>
                  {p.fingerprint
                    ? `${p.email} · key ${p.fingerprint.slice(0, 9)}`
                    : 'No account yet · gets an invitation'}
                </span>
              </div>
              <Select
                compact
                aria-label={`Role for ${p.displayName ?? p.email}`}
                options={ROLES}
                value={p.role}
                onChange={(e) =>
                  setPeople((list) =>
                    list.map((x) =>
                      x.email === p.email ? { ...x, role: e.target.value as VaultRole } : x,
                    ),
                  )
                }
              />
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${p.email}`}
                onClick={() => setPeople((list) => list.filter((x) => x.email !== p.email))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>

        <div className={styles.add}>
          <TextField
            label="Add someone"
            type="email"
            placeholder="name@company.com"
            value={email}
            error={lookupError}
            onChange={(e) => {
              setEmail(e.target.value)
              setLookupError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addPerson()
              }
            }}
          />
          <Button variant="ghost" icon="plus" loading={looking} onClick={addPerson}>
            Add
          </Button>
        </div>

        {create.isError && (
          <Callout tone="danger" title="The vault was not created">
            {errorMessage(create.error)}
          </Callout>
        )}

        <p className={styles.note}>
          A vault is a key ring, not a folder. Adding a member wraps every data key in it to their
          public key.
        </p>
      </form>
    </Modal>
  )
}
