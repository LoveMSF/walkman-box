export interface Track {
  id: string
  title: string
  artist: string
  album: string
  format: string
  size: number
  duration: number
  favorite: boolean
  artwork: string
  demo?: boolean
  audio: Blob
  addedAt: number
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
  createdAt: number
}

const DATABASE = 'walkmanbox-library'
const VERSION = 1

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      const tracks = db.createObjectStore('tracks', { keyPath: 'id' })
      tracks.createIndex('addedAt', 'addedAt')
      db.createObjectStore('playlists', { keyPath: 'id' })
      db.createObjectStore('settings', { keyPath: 'key' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(store: string, mode: IDBTransactionMode, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode)
    const request = action(tx.objectStore(store))
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
    tx.onabort = () => reject(tx.error)
  })
}

export const getAllTracks = () => transaction<Track[]>('tracks', 'readonly', store => store.getAll())
export const saveTrack = (track: Track) => transaction<IDBValidKey>('tracks', 'readwrite', store => store.put(track))
export async function saveTracks(tracks: Track[]): Promise<void> {
  if (!tracks.length) return
  const db = await database()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('tracks', 'readwrite')
    const store = tx.objectStore('tracks')
    tracks.forEach(track => store.put(track))
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}
export const removeTrack = (id: string) => transaction<undefined>('tracks', 'readwrite', store => store.delete(id))
export const getAllPlaylists = () => transaction<Playlist[]>('playlists', 'readonly', store => store.getAll())
export const savePlaylist = (playlist: Playlist) => transaction<IDBValidKey>('playlists', 'readwrite', store => store.put(playlist))
export const removePlaylist = (id: string) => transaction<undefined>('playlists', 'readwrite', store => store.delete(id))
export const getSetting = (key: string) => transaction<{ key: string; value: unknown } | undefined>('settings', 'readonly', store => store.get(key))
export const saveSetting = (key: string, value: unknown) => transaction<IDBValidKey>('settings', 'readwrite', store => store.put({ key, value }))
