import { useState } from 'react'
import {
  Avatar,
  AvatarStack,
  Button,
  Callout,
  Checkbox,
  Chip,
  DataCell,
  DataGrid,
  EmptyState,
  FileKindBox,
  FileRow,
  FileTable,
  HashBlock,
  Icon,
  Logo,
  Modal,
  ProgressBar,
  SearchBar,
  SectionMark,
  Select,
  Skeleton,
  StateDot,
  Tag,
  TextField,
  Toggle,
  toast,
} from '@/components'
import { iconPaths, type IconName } from '@/components/Icon/paths'
import { useDocumentTitle } from '@/hooks/useCrumbs'
import styles from './UiKitPage.module.css'

const resetMockDb = () => import('@/mocks/db').then((m) => m.resetMockDb())

const people = [
  { userId: '1', displayName: 'Maya Okafor' },
  { userId: '2', displayName: 'Ilan Rosen' },
  { userId: '3', displayName: 'Sam Kader' },
  { userId: '4', displayName: 'Jack Bermingham' },
]

// dev only (/dev/ui): every component on one page, to check against figma screen 55
export default function UiKitPage() {
  useDocumentTitle('Component library')
  const [modal, setModal] = useState(false)
  const [chip, setChip] = useState('All')
  const [on, setOn] = useState(true)
  const [selected, setSelected] = useState(false)

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Logo />
        <div className={styles.headRow}>
          <div>
            <h1 className={styles.title}>Component library</h1>
            <p className={styles.sub}>
              Every element used across the 57 screens, built once. Compare with figma screen 55.
            </p>
          </div>
          {import.meta.env.VITE_USE_MOCKS === 'true' && (
            <Button variant="danger" size="sm" onClick={resetMockDb}>
              Reset mock data
            </Button>
          )}
        </div>
      </header>

      <section className={styles.section}>
        <SectionMark num="01">Buttons</SectionMark>
        <div className={styles.row}>
          <Button>Primary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button icon="upload">Upload</Button>
          <Button icon="down">Download</Button>
          <Button icon="plus">Add member</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button variant="ghost" icon="dots" aria-label="More" />
          <Button size="sm" variant="ghost">
            Compact
          </Button>
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="02">Input fields</SectionMark>
        <div className={styles.grid4}>
          <TextField label="Default" defaultValue="jack@northgate.io" />
          <TextField
            label="Focus"
            defaultValue="jack@northgate.io"
            hint="one address per account"
          />
          <TextField
            label="Valid"
            defaultValue="jack@northgate.io"
            hint="public key on file"
            valid
          />
          <TextField
            label="Error"
            defaultValue="jack@northgate"
            error="that address has no domain"
          />
        </div>
        <div className={styles.grid4}>
          <Select
            label="Role"
            options={[
              { value: 'viewer', label: 'Viewer' },
              { value: 'editor', label: 'Editor' },
              { value: 'manager', label: 'Manager' },
            ]}
          />
          <TextField label="Recovery code" mono placeholder="XXXX-XXXX" />
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="03">Tags and status</SectionMark>
        <div className={styles.row}>
          <Tag tone="accent">Encrypted</Tag>
          <Tag tone="warn">Pending key</Tag>
          <Tag tone="danger">Revoked</Tag>
          <Tag tone="neutral">Viewer</Tag>
          <Tag tone="solid">Owner</Tag>
          <StateDot state="ok">ok</StateDot>
          <StateDot state="warn">warn</StateDot>
          <StateDot state="off">off</StateDot>
          {people.map((p) => (
            <Avatar key={p.userId} name={p.displayName} size={28} />
          ))}
          <Avatar name="Jack Bermingham" size={44} />
          <AvatarStack people={people} />
          {[
            'application/pdf',
            'application/msword',
            'application/vnd.ms-excel',
            'application/zip',
            'text/markdown',
          ].map((m) => (
            <FileKindBox key={m} mimeType={m} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="04">Filter chips</SectionMark>
        <div className={styles.row}>
          {[
            ['All', 24],
            ['Shared', 11],
            ['Starred', 5],
            ['PDF', 8],
            ['Expiring', 2],
          ].map(([label, count]) => (
            <Chip
              key={label}
              on={chip === label}
              count={count as number}
              onClick={() => setChip(label as string)}
            >
              {label}
            </Chip>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="05">Search bar</SectionMark>
        <div className={styles.grid2}>
          <SearchBar size="lg" defaultValue="northgate" />
          <SearchBar size="lg" placeholder="Search this vault" />
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="06">Toggle rows and checklines</SectionMark>
        <div className={styles.grid2}>
          <Checkbox
            defaultChecked
            label="Require sign-in to open the link"
            sub="the link alone is never enough"
          />
          <Checkbox label="Allow ciphertext download" sub="preview only when off" />
        </div>
        <div className={styles.row}>
          <Toggle checked={on} onChange={setOn} label="Email me" />
          <Toggle checked={!on} onChange={(v) => setOn(!v)} label="Push" />
          <Toggle
            checked
            onChange={() => {}}
            label="Security alerts"
            lockedReason="Security alerts can't be turned off"
          />
          <div style={{ width: 220 }}>
            <ProgressBar value={0.62} label="Upload progress" />
          </div>
          <div style={{ width: 220 }}>
            <ProgressBar value={0.9} tone="warn" label="Storage used" />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="07">Table header and file row</SectionMark>
        <FileTable selectable>
          <FileRow
            name="contract-northgate-2026.pdf"
            mimeType="application/pdf"
            meta="sha256 a1f7…8c  ·  4.2 MB"
            version="v4"
            people={people.slice(0, 3)}
            when="2h ago"
            who="Maya O."
            favorite
            selected={selected}
            onSelect={setSelected}
            onOpen={() => toast('Open file (phase 3)')}
            onMenu={() => toast('Row menu (phase 4)')}
          />
          <FileRow
            name="dpa-appendix-signed.pdf"
            mimeType="application/pdf"
            meta="sha256 7b02…e1  ·  1.1 MB"
            version="v2"
            people={people.slice(0, 3)}
            when="Yesterday"
            who="Jack B."
            onSelect={() => {}}
            onMenu={() => {}}
          />
          <FileRow
            name="security-review-q1.docx"
            mimeType="application/msword"
            meta="sha256 c94d…41  ·  860 KB"
            version="v7"
            people={people}
            when="Yesterday"
            who="Ilan R."
            onSelect={() => {}}
            onMenu={() => {}}
          />
        </FileTable>
      </section>

      <section className={styles.section}>
        <SectionMark num="08">Icon set</SectionMark>
        <div className={styles.icons}>
          {(Object.keys(iconPaths) as IconName[]).map((name) => (
            <figure key={name} className={styles.iconCell}>
              <span className={styles.iconBox}>
                <Icon name={name} />
              </span>
              <figcaption>{name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <SectionMark num="09">Data cells and hashes</SectionMark>
        <DataGrid cols={3}>
          <DataCell label="Cipher">AES-256-GCM</DataCell>
          <DataCell label="IV">9f3c1a77e0b45d22</DataCell>
          <DataCell label="Auth tag">5d41402abc4b2a76</DataCell>
        </DataGrid>
        <HashBlock label="Fingerprint" value="cd3b8cbcf539f9f64401 0ae3c38ae53f" grouped copyable />
      </section>

      <section className={styles.section}>
        <SectionMark num="10">Feedback</SectionMark>
        <Callout tone="warn">
          Each code works once. Screenshotting them into the same laptop you are protecting defeats
          the point.
        </Callout>
        <Callout tone="danger" title="Integrity check failed on chunk 2 of 3">
          The ciphertext does not match its authentication tag. The partial file was discarded.
        </Callout>
        <Callout tone="ok">Wrapped key delivered to 3 recipients.</Callout>
        <Callout>Search runs on this device. The query never reaches the server.</Callout>
        <div className={styles.row}>
          <Button variant="ghost" onClick={() => setModal(true)}>
            Open modal
          </Button>
          <Button variant="ghost" onClick={() => toast('Vault created', 'ok')}>
            Toast ok
          </Button>
          <Button variant="ghost" onClick={() => toast('Step-up expired, confirm again', 'warn')}>
            Toast warn
          </Button>
          <Button variant="ghost" onClick={() => toast('Upload failed on chunk 3', 'danger')}>
            Toast danger
          </Button>
        </div>
        <div className={styles.grid2}>
          <div className={styles.skeletons}>
            <Skeleton width="60%" />
            <Skeleton width="40%" height={8} />
            <Skeleton width="80%" />
          </div>
          <EmptyState icon="star" title="No favorites yet">
            Star a file and it shows up here. Favorites are stored as metadata only.
          </EmptyState>
        </div>
      </section>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="New vault"
        subtitle="a key ring, not a folder"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => setModal(false)}>Create vault</Button>
          </>
        }
      >
        <div className={styles.modalBody}>
          <TextField label="Vault name" placeholder="Product Legal" autoFocus />
          <TextField label="Description" placeholder="What goes in here" />
        </div>
      </Modal>
    </div>
  )
}
