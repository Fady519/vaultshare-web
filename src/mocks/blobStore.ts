/*
  The mock's "S3 bucket": ciphertext chunks keyed by "<storagePfx>/<index>".
  IndexedDB because localStorage can't hold megabytes of binary.
*/

const DB_NAME = 'vaultshare-mock-blobs'
const STORE = 'chunks'

let opening: Promise<IDBDatabase> | null = null

function openDb() {
  if (!opening) {
    opening = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return opening
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  const idb = await openDb()
  return new Promise<T>((resolve, reject) => {
    const req = fn(idb.transaction(STORE, mode).objectStore(STORE))
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export const putBlob = (key: string, bytes: Uint8Array) =>
  run('readwrite', (s) => s.put(bytes, key))

export const getBlob = (key: string) =>
  run<Uint8Array | undefined>('readonly', (s) => s.get(key) as IDBRequest<Uint8Array | undefined>)

export const deleteBlob = (key: string) => run('readwrite', (s) => s.delete(key))

export const clearBlobs = () => run('readwrite', (s) => s.clear())
