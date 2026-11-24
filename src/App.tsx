import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Activity, Album, ArrowLeft, AudioLines, Check, ChevronDown, Disc3, FolderPlus, Headphones, Heart, ListMusic, MoreHorizontal, Music2, Pause, Play, Plus, Repeat, Repeat1, Search, Settings2, Shuffle, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Trash2, Upload, Volume2, X } from 'lucide-react'
import { audioGraph, createDemoTracks, resumeAudio, setEqualizer, type Equalizer } from './audio'
import { getAllPlaylists, getAllTracks, getSetting, removePlaylist, removeTrack, savePlaylist, saveSetting, saveTrack, saveTracks, type Playlist, type Track } from './storage'

type Tab = 'library' | 'playlists' | 'favorites'
type RepeatMode = 'off' | 'all' | 'one'
const emptyEq: Equalizer = { bass: 0, mid: 0, treble: 0 }
const prettyBytes = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`
const timeLabel = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, '0')}`
const extOf = (name: string) => name.split('.').pop()?.toUpperCase() || 'AUDIO'
const idOf = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`

function Cover({ variant = 'sunset', small = false, playing = false }: { variant?: string; small?: boolean; playing?: boolean }) {
  return <div className={`cover-art cover-${variant} ${small ? 'cover-small' : ''} ${playing ? 'cover-spinning' : ''}`}>
    <span className="cover-sun" /><span className="cover-ring" /><span className="cover-sheen" />
    {!small && <span className="cover-stamp"><span>WALKMANBOX</span><b>SIDE A</b></span>}
    {small && <Disc3 size={18} strokeWidth={1.55} className="cover-disc-mark" />}
  </div>
}

function Visualizer({ element, active }: { element: HTMLAudioElement | null; active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    let frame = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    let analyser: AnalyserNode | null = null
    if (element) { try { analyser = audioGraph(element).analyser } catch { /* The audio element can already be wired. */ } }
    const bins = new Uint8Array(analyser?.frequencyBinCount ?? 128)
    const draw = () => {
      const box = canvas.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1
      if (canvas.width !== Math.round(box.width * dpr) || canvas.height !== Math.round(box.height * dpr)) { canvas.width = Math.round(box.width * dpr); canvas.height = Math.round(box.height * dpr) }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, box.width, box.height)
      if (analyser && active) analyser.getByteFrequencyData(bins)
      else bins.forEach((_, i) => { bins[i] = active ? Math.max(5, Math.round((Math.sin(Date.now() / 250 + i * 0.38) * 0.5 + 0.5) * 72)) : 3 })
      const count = 56; const gap = 4; const bar = Math.max(2, (box.width - count * gap) / count)
      for (let i = 0; i < count; i++) {
        const val = bins[Math.floor(i * bins.length / count)] / 255
        const dots = Math.max(1, Math.floor(val * 9)); const x = i * (bar + gap)
        for (let dot = 0; dot < dots; dot++) {
          const y = box.height / 2 + (dot - (dots - 1) / 2) * 5
          ctx.fillStyle = dot === dots - 1 && val > 0.73 ? '#D71921' : '#FFFFFF'
          ctx.fillRect(x, y, bar, 2)
        }
      }
      frame = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(frame)
  }, [element, active])
  return <canvas className="visualizer" ref={canvasRef} aria-label="Live audio spectrum visualizer" />
}

export default function App() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [tab, setTab] = useState<Tab>('library')
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [shuffle, setShuffle] = useState(false)
  const [fullPlayer, setFullPlayer] = useState(false)
  const [eqOpen, setEqOpen] = useState(false)
  const [eq, setEq] = useState<Equalizer>(emptyEq)
  const [speed, setSpeed] = useState(1)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'recent' | 'artist'>('all')
  const [activePlaylist, setActivePlaylist] = useState<string | null>(null)
  const [playlistEditor, setPlaylistEditor] = useState<{ id?: string; name: string } | null>(null)
  const [playlistMenu, setPlaylistMenu] = useState<string | null>(null)
  const [queueMenu, setQueueMenu] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)
  const [storageText, setStorageText] = useState('On this device')
  const [lightMode, setLightMode] = useState(() => localStorage.getItem('walkmanbox-theme') === 'light')
  const audioRef = useRef<HTMLAudioElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const objectUrls = useRef(new Map<string, string>())
  const pickFolder = () => { const input = inputRef.current; if (input) { input.setAttribute('webkitdirectory', ''); input.click() } }

  const current = tracks.find(track => track.id === currentId) ?? null
  useEffect(() => {
    let mounted = true
    void (async () => {
      try {
        let loadedTracks = await getAllTracks()
        if (!loadedTracks.length) {
          const demos = await createDemoTracks()
          for (const demo of demos) await saveTrack(demo)
          loadedTracks = await getAllTracks()
        }
        const [loadedPlaylists, savedEq, savedSpeed] = await Promise.all([getAllPlaylists(), getSetting('equalizer'), getSetting('speed')])
        if (mounted) {
          setTracks(loadedTracks.sort((a, b) => a.addedAt - b.addedAt)); setPlaylists(loadedPlaylists)
          if (savedEq?.value) setEq(savedEq.value as Equalizer)
          if (typeof savedSpeed?.value === 'number') setSpeed(savedSpeed.value)
        }
      } catch (error) { console.error('Could not open the offline library', error) }
      finally { if (mounted) setBusy(false) }
    })()
    return () => { mounted = false; objectUrls.current.forEach(URL.revokeObjectURL); objectUrls.current.clear() }
  }, [])

  useEffect(() => {
    let canceled = false
    const update = async () => {
      if (!navigator.storage?.estimate) return
      try { const { usage, quota } = await navigator.storage.estimate(); if (!canceled && quota) setStorageText(`${prettyBytes(usage ?? 0)} used · ${prettyBytes(quota)} available`) } catch { /* Storage estimates are an optional browser API. */ }
    }
    void update(); return () => { canceled = true }
  }, [tracks.length])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    let list = tracks.filter(track => tab !== 'favorites' || track.favorite)
    if (activePlaylist) { const ids = playlists.find(item => item.id === activePlaylist)?.trackIds ?? []; list = list.filter(track => ids.includes(track.id)) }
    if (filter === 'recent') list = [...list].sort((a, b) => b.addedAt - a.addedAt)
    if (filter === 'artist') list = [...list].sort((a, b) => a.artist.localeCompare(b.artist))
    if (needle) list = list.filter(track => `${track.title} ${track.artist} ${track.album}`.toLowerCase().includes(needle))
    return list
  }, [tracks, tab, query, filter, playlists, activePlaylist])

  useEffect(() => {
    if (!current || !audioRef.current) return
    let url = objectUrls.current.get(current.id)
    if (!url) { url = URL.createObjectURL(current.audio); objectUrls.current.set(current.id, url) }
    const el = audioRef.current
    if (el.src !== url) el.src = url
    el.playbackRate = speed
    setEqualizer(eq)
    setDuration(current.duration || 0)
  }, [current, speed, eq])

  useEffect(() => {
    const el = audioRef.current
    if (!el) return
    const onTime = () => setPosition(el.currentTime || 0)
    const onMetadata = () => {
      const actual = Number.isFinite(el.duration) ? el.duration : 0
      setDuration(actual)
      if (current && actual > 0 && Math.abs(current.duration - actual) > 1) {
        const updated = { ...current, duration: actual }
        setTracks(prev => prev.map(item => item.id === current.id ? updated : item)); void saveTrack(updated)
      }
    }
    const onEnded = () => {
      if (repeat === 'one') { el.currentTime = 0; void el.play(); return }
      if (repeat === 'all' && !shuffle) { void stepTrack(1); return }
      if (shuffle && tracks.length > 1) { void stepTrack(1); return }
      setPlaying(false)
    }
    const onPlay = () => setPlaying(true); const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate', onTime); el.addEventListener('loadedmetadata', onMetadata); el.addEventListener('ended', onEnded); el.addEventListener('play', onPlay); el.addEventListener('pause', onPause)
    return () => { el.removeEventListener('timeupdate', onTime); el.removeEventListener('loadedmetadata', onMetadata); el.removeEventListener('ended', onEnded); el.removeEventListener('play', onPlay); el.removeEventListener('pause', onPause) }
  })

  const stepTrack = useCallback(async (delta: number) => {
    if (!tracks.length) return
    const list = filtered.length ? filtered : tracks
    const at = list.findIndex(track => track.id === currentId)
    const nextIndex = shuffle && list.length > 1 ? (at + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length : (at + delta + list.length) % list.length
    setCurrentId(list[nextIndex].id); setPosition(0)
    requestAnimationFrame(() => { const audio = audioRef.current; if (audio) void resumeAudio().then(() => audio.play()).catch(() => setPlaying(false)) })
  }, [tracks, filtered, currentId, shuffle])

  const playTrack = async (track: Track) => {
    const el = audioRef.current
    if (currentId === track.id && el) { if (el.paused) { await resumeAudio(); await el.play() } else el.pause(); return }
    setCurrentId(track.id); setPosition(0); setFullPlayer(true)
    try { const graph = el && audioGraph(el); await graph?.context.resume(); await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); if (audioRef.current) { await audioRef.current.play(); setPlaying(true) } }
    catch (error) { console.error('Playback could not start', error); setPlaying(false) }
  }

  const toggleFavorite = async (track: Track) => { const updated = { ...track, favorite: !track.favorite }; setTracks(prev => prev.map(item => item.id === track.id ? updated : item)); await saveTrack(updated) }
  const importFiles = async (files: FileList | null) => {
    inputRef.current?.removeAttribute('webkitdirectory')
    if (!files) return
    const valid = Array.from(files).filter(file => file.type.startsWith('audio/') || /\.(mp3|wav|flac|ogg|m4a|aac|opus)$/i.test(file.name))
    if (inputRef.current) inputRef.current.value = ''
    const imported: Track[] = []
    for (let offset = 0; offset < valid.length; offset += 8) {
      const batch = await Promise.all(valid.slice(offset, offset + 8).map(file => new Promise<Track>(resolve => {
        const audio = new Audio(); const url = URL.createObjectURL(file); let finished = false
        const finish = () => { if (finished) return; finished = true; const duration = Number.isFinite(audio.duration) ? audio.duration : 0; audio.removeAttribute('src'); URL.revokeObjectURL(url); resolve({ id: idOf(), title: file.name.replace(/\.[^.]+$/, ''), artist: 'Unknown artist', album: 'LOCAL FILE', format: extOf(file.name), size: file.size, duration, favorite: false, artwork: 'sunset', audio: file, addedAt: Date.now() + Math.random() }) }
        audio.preload = 'metadata'; audio.onloadedmetadata = finish; audio.onerror = finish; audio.src = url; setTimeout(finish, 8000)
      })))
      imported.push(...batch)
    }
    setTracks(prev => [...prev, ...imported].sort((a, b) => a.addedAt - b.addedAt))
    await saveTracks(imported)
    if (imported.length) { setTab('library'); setActivePlaylist(null); if (!currentId) await playTrack(imported[0]) }
  }
  const deleteTrack = async (track: Track) => {
    await removeTrack(track.id); const url = objectUrls.current.get(track.id); if (url) { URL.revokeObjectURL(url); objectUrls.current.delete(track.id) }
    setTracks(prev => prev.filter(item => item.id !== track.id)); setPlaylists(prev => prev.map(playlist => ({ ...playlist, trackIds: playlist.trackIds.filter(id => id !== track.id) })))
    for (const playlist of playlists) if (playlist.trackIds.includes(track.id)) await savePlaylist({ ...playlist, trackIds: playlist.trackIds.filter(id => id !== track.id) })
    if (currentId === track.id) { audioRef.current?.pause(); setCurrentId(null); setPlaying(false); setFullPlayer(false) }
  }

  const editPlaylist = async () => {
    if (!playlistEditor?.name.trim()) return
    const existing = playlistEditor.id ? playlists.find(item => item.id === playlistEditor.id) : undefined
    const next: Playlist = { id: existing?.id ?? idOf(), name: playlistEditor.name.trim(), trackIds: existing?.trackIds ?? [], createdAt: existing?.createdAt ?? Date.now() }
    await savePlaylist(next); setPlaylists(prev => existing ? prev.map(item => item.id === next.id ? next : item) : [next, ...prev]); setPlaylistEditor(null)
  }
  const addToPlaylist = async (trackId: string, playlistId: string) => {
    const playlist = playlists.find(item => item.id === playlistId); if (!playlist) return
    const next = { ...playlist, trackIds: playlist.trackIds.includes(trackId) ? playlist.trackIds : [...playlist.trackIds, trackId] }
    await savePlaylist(next); setPlaylists(prev => prev.map(item => item.id === next.id ? next : item)); setQueueMenu(null)
  }
  const removePlaylistTrack = async (trackId: string, playlist: Playlist) => {
    const next = { ...playlist, trackIds: playlist.trackIds.filter(id => id !== trackId) }; await savePlaylist(next); setPlaylists(prev => prev.map(item => item.id === next.id ? next : item))
  }
  const updateEq = (band: keyof Equalizer, value: number) => { const next = { ...eq, [band]: value }; setEq(next); setEqualizer(next); void saveSetting('equalizer', next) }
  const resetEq = () => { const next = { bass: 0, mid: 0, treble: 0 }; setEq(next); setEqualizer(next); void saveSetting('equalizer', next) }
  const updateSpeed = (value: number) => { setSpeed(value); if (audioRef.current) audioRef.current.playbackRate = value; void saveSetting('speed', value) }
  const togglePlay = async () => {
    if (!current) { if (tracks[0]) await playTrack(tracks[0]); return }
    const el = audioRef.current
    if (!el) return
    try { if (el.paused) { await resumeAudio(); await el.play() } else el.pause() } catch { setPlaying(false) }
  }

  return <main className={`app-shell nothing-shell ${lightMode ? 'theme-light' : ''}`}>
    <audio ref={audioRef} preload="metadata" />
    <input ref={inputRef} className="visually-hidden" type="file" multiple accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac,.opus" onChange={event => void importFiles(event.target.files)} />
    <aside className="sidebar">
      <a className="brand" href="#home" onClick={event => { event.preventDefault(); setTab('library'); setActivePlaylist(null) }}><span className="brand-icon"><AudioLines size={20} /></span><span>walkman<span>box.</span></span><span className="brand-dot" /></a>
      <div className="sidebar-caption">YOUR SPACE</div>
      <nav className="side-nav" aria-label="Main navigation">
        <button className={!activePlaylist && tab === 'library' ? 'nav-item selected' : 'nav-item'} onClick={() => { setTab('library'); setActivePlaylist(null) }}><Album size={17} /><span>My library</span><span className="nav-count">{tracks.length}</span></button>
        <button className={tab === 'favorites' ? 'nav-item selected' : 'nav-item'} onClick={() => { setTab('favorites'); setActivePlaylist(null) }}><Heart size={17} /><span>Favorites</span><span className="nav-count">{tracks.filter(track => track.favorite).length}</span></button>
        <button className={!activePlaylist && tab === 'playlists' ? 'nav-item selected' : 'nav-item'} onClick={() => { setTab('playlists'); setActivePlaylist(null) }}><ListMusic size={17} /><span>Playlists</span></button>
      </nav>
      <div className="playlist-side-heading"><span>YOUR PLAYLISTS</span><button className="icon-button side-add" onClick={() => setPlaylistEditor({ name: '' })} aria-label="Create playlist"><Plus size={16} /></button></div>
      <div className="side-playlists">{playlists.map(playlist => <button key={playlist.id} className={activePlaylist === playlist.id ? 'playlist-nav active' : 'playlist-nav'} onClick={() => { setTab('playlists'); setActivePlaylist(playlist.id) }}><span className="playlist-swatch"><Disc3 size={14} /></span><span className="playlist-nav-name">{playlist.name}</span><span className="nav-count">{playlist.trackIds.length}</span></button>)}</div>
      <div className="sidebar-bottom"><div className="offline-chip"><span className="status-dot" /><span><strong>ALL LOCAL</strong><small>Ready when you are.</small></span></div><div className="storage-caption"><Volume2 size={13} /><span title={storageText}>{storageText}</span></div><span className="version-note">WALKMANBOX · EST. MMXXIV</span></div>
    </aside>

    <section className="main-column">
      <header className="topbar"><div className="mobile-brand">NOTHING<span> / BOX</span></div><div className="breadcrumbs"><span>SOUND SYSTEM</span><span className="breadcrumb-slash">/</span><strong>{activePlaylist ? playlists.find(item => item.id === activePlaylist)?.name : tab === 'favorites' ? 'Favorites' : tab === 'playlists' ? 'Playlists' : 'Music library'}</strong></div><button className="sound-pill" onClick={() => { const next = !lightMode; setLightMode(next); localStorage.setItem('walkmanbox-theme', next ? 'light' : 'dark') }}><span className="sound-led" /><span>{lightMode ? 'LIGHT' : 'DARK'}</span><span className="theme-switch">◐</span></button></header>
      <div className="content">
        {tab === 'playlists' && !activePlaylist ? <>
          <div className="hero-banner playlists-hero"><div className="hero-text"><span className="eyebrow"><ListMusic size={13} /> YOUR COLLECTION</span><h1>A place for<br />every <em>mood.</em></h1><p>Handpicked moments. Your soundtrack, your way.</p></div><div className="hero-decoration"><span className="hero-disc disc-one" /><span className="hero-disc disc-two" /><span className="hero-decoration-label">SIDE A · 33⅓ RPM</span></div><span className="hero-index">NO. 002 / 024</span></div>
          <div className="section-heading"><div><div className="overline">MADE BY YOU</div><h2>Your playlists <span className="heading-count">{String(playlists.length).padStart(2, '0')}</span></h2></div><button className="outline-button" onClick={() => setPlaylistEditor({ name: '' })}><Plus size={15} /> New playlist</button></div>
          {playlists.length ? <div className="playlist-grid">{playlists.map((playlist, index) => <article key={playlist.id} className="playlist-card" onClick={() => setActivePlaylist(playlist.id)}><div className={`playlist-art playlist-art-${index % 3}`}><span className="playlist-art-disc"><span /></span><span className="playlist-art-mark">W<span>BOX</span></span><div className="playlist-art-footer"><span>COMPILATION NO. {String(index + 1).padStart(2, '0')}</span><Disc3 size={14} /></div></div><div className="playlist-card-info"><div><h3>{playlist.name}</h3><span>{playlist.trackIds.length} tracks · PERSONAL MIX</span></div><button className="icon-button card-more" aria-label={`Playlist options for ${playlist.name}`} onClick={event => { event.stopPropagation(); setPlaylistMenu(playlistMenu === playlist.id ? null : playlist.id) }}><MoreHorizontal size={19} /></button></div>{playlistMenu === playlist.id && <div className="floating-menu playlist-floating"><button onClick={event => { event.stopPropagation(); setPlaylistEditor({ id: playlist.id, name: playlist.name }); setPlaylistMenu(null) }}>Rename playlist</button><button className="danger-option" onClick={event => { event.stopPropagation(); void removePlaylist(playlist.id).then(() => setPlaylists(prev => prev.filter(p => p.id !== playlist.id))); setPlaylistMenu(null) }}>Delete playlist</button></div>}</article>)}</div> : <div className="empty-card playlist-empty"><div className="empty-icon"><ListMusic size={21} /></div><h3>First, set a mood.</h3><p>Gather the songs that sound like yours.</p><button className="solid-button" onClick={() => setPlaylistEditor({ name: '' })}><Plus size={15} /> Create your first playlist</button></div>}
        </> : <>
          <div className="hero-banner library-hero"><div className="hero-text"><span className="eyebrow"><span className="equalizer-mark"><i /><i /><i /></span> YOUR SOUND, OFF GRID</span><h1>Music without<br />the <em>noise.</em></h1><p>Your collection. Your device. Always in tune.</p><button className="import-button" onClick={() => inputRef.current?.click()}><Upload size={15} strokeWidth={2.2} /> Import your music <span className="button-arrow">↗</span></button><button type="button" className="folder-pick" onClick={pickFolder}><FolderPlus size={13} /> Choose a folder</button><span className="folder-note"><FolderPlus size={12} /> Songs & folders, right from your device</span></div><div className="hero-art"><div className="hero-album-wrap"><Cover variant="sunset" /><span className="album-sticker"><Sparkles size={12} /><span>ALL<br />YOURS</span></span></div><span className="floating-tag tag-one">NO SKIPS. NO SIGNAL.</span><span className="floating-tag tag-two">EST. IN YOUR ROOM ♬</span><span className="hero-stamp">ANALOG HEART<br /><strong>DIGITAL FREEDOM</strong></span></div><span className="hero-index">NO. 001 / OFFLINE</span></div>
          <div className="stats-row"><div className="stat-item"><span className="stat-icon"><Disc3 size={15} /></span><div><strong>{String(tracks.length).padStart(2, '0')}</strong><span>TRACKS IN THE BOX</span></div></div><span className="stat-divider" /><div className="stat-item"><span className="stat-icon stat-icon-green"><Activity size={15} /></span><div><strong>100<span className="percent">%</span></strong><span>OFFLINE READY</span></div></div><div className="stats-doodle">♫</div></div>
          <div className="section-heading library-heading"><div><div className="overline">THE GOOD STUFF</div><h2>{tab === 'favorites' ? 'Heart & soul' : activePlaylist ? playlists.find(item => item.id === activePlaylist)?.name ?? 'The collection' : 'The collection'} <span className="heading-count">{String(filtered.length).padStart(2, '0')}</span></h2></div><div className="section-actions"><label className="search-box"><Search size={15} /><input aria-label="Search tracks" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a track..." /><kbd>⌘ K</kbd></label><select className="sort-select" value={filter} onChange={event => setFilter(event.target.value as typeof filter)} aria-label="Sort tracks"><option value="all">All tracks</option><option value="recent">Recently added</option><option value="artist">By artist</option></select></div></div>
          <div className="track-table"><div className="table-header"><span className="track-number">#</span><span className="track-title-head">TITLE</span><span className="track-album-head">ALBUM</span><span className="track-size-head">SIZE</span><span className="track-duration-head">TIME</span><span /></div>
            {busy ? <div className="empty-card loading-card"><span className="loader-dot" /><span>Warming up the tapes...</span></div> : filtered.map((track, index) => <div className={`track-row ${currentId === track.id ? 'track-active' : ''}`} key={track.id}>
              <button className="track-number row-play" onClick={() => void playTrack(track)} aria-label={`${currentId === track.id && playing ? 'Pause' : 'Play'} ${track.title}`}>{currentId === track.id && playing ? <span className="row-eq"><i /><i /><i /></span> : <><span>{String(index + 1).padStart(2, '0')}</span><Play size={13} className="row-play-icon" fill="currentColor" /></>}</button>
              <button className="track-info" onClick={() => void playTrack(track)}><Cover variant={track.artwork} small playing={currentId === track.id && playing} /><span className="track-copy"><strong className={currentId === track.id ? 'active-track-title' : ''}>{track.title}</strong><small>{track.artist} <span className="mobile-inline-format">· {track.format}</span></small></span></button>
              <span className="track-album">{track.album}</span><span className="track-size"><span className="format-badge">{track.format}</span><span className="size-value">{prettyBytes(track.size)}</span></span><span className="track-duration">{timeLabel(track.duration)}</span>
              <span className="track-actions"><button className={`icon-button heart-button ${track.favorite ? 'is-favorite' : ''}`} aria-label={track.favorite ? 'Remove from favorites' : 'Add to favorites'} onClick={() => void toggleFavorite(track)}><Heart size={16} fill={track.favorite ? 'currentColor' : 'none'} /></button><button className="icon-button queue-button" aria-label="Track options" onClick={() => setQueueMenu(queueMenu === track.id ? null : track.id)}><MoreHorizontal size={17} /></button>{queueMenu === track.id && <div className="floating-menu track-floating">{playlists.map(playlist => <button key={playlist.id} onClick={() => void addToPlaylist(track.id, playlist.id)}>{playlist.trackIds.includes(track.id) ? <Check size={14} /> : <Plus size={14} />} Add to {playlist.name}</button>)}{activePlaylist && <button onClick={() => { const playlist = playlists.find(item => item.id === activePlaylist); if (playlist) void removePlaylistTrack(track.id, playlist); setQueueMenu(null) }}>Remove from this playlist</button>}<button className="danger-option" onClick={() => { setQueueMenu(null); void deleteTrack(track) }}><Trash2 size={14} /> Delete from device</button></div>}</span>
            </div>)}
            {!busy && filtered.length === 0 && <div className="empty-card"><div className="empty-icon">{tab === 'favorites' ? <Heart size={19} /> : query ? <Search size={19} /> : <Music2 size={19} />}</div><h3>{query ? 'Nothing in this frequency.' : tab === 'favorites' ? 'Keep the ones you love.' : 'Your next favorite starts here.'}</h3><p>{query ? 'Try another title, artist, or album.' : tab === 'favorites' ? 'Tap the heart on any track to keep it close.' : 'Import a few tracks and let the listening begin.'}</p>{!query && tab !== 'favorites' && <button className="solid-button" onClick={() => inputRef.current?.click()}><Upload size={14} /> Choose music files</button>}</div>}
          </div>
          <div className="library-footnote"><span><span className="status-dot" /> STORED SAFELY ON THIS DEVICE</span><span>MP3 · WAV · FLAC · OGG · M4A</span></div>
        </>}
      </div>
    </section>

    {current && !fullPlayer && <button className="mini-player" onClick={() => setFullPlayer(true)} aria-label={`Open Now Playing for ${current.title}`}><Cover variant={current.artwork} small playing={playing} /><span className="mini-track"><strong>{current.title}</strong><small>{current.artist}</small></span><button className="mini-action favorite-mini" aria-label="Toggle favorite" onClick={event => { event.stopPropagation(); void toggleFavorite(current) }}><Heart size={16} fill={current.favorite ? 'currentColor' : 'none'} /></button><button className="mini-action" aria-label={playing ? 'Pause' : 'Play'} onClick={event => { event.stopPropagation(); void togglePlay() }}>{playing ? <Pause size={19} fill="currentColor" /> : <Play size={20} fill="currentColor" />}</button><span className="mini-progress"><span style={{ width: `${duration ? position / duration * 100 : 0}%` }} /></span></button>}
    {current && fullPlayer && <div className="player-overlay"><div className="player-topbar"><button className="player-back" onClick={() => setFullPlayer(false)}><ArrowLeft size={17} /><span>BACK TO YOUR MUSIC</span></button><span className="player-top-center">NOW PLAYING <span>·</span> LOCAL SESSION</span><button className="icon-button" aria-label="Close player" onClick={() => setFullPlayer(false)}><X size={18} /></button></div><div className="player-content"><div className="player-record-stage"><div className="record-glow" /><div className={`hero-record ${playing ? 'record-rotating' : ''}`}><div className="record-grooves" /><div className="record-label"><Cover variant={current.artwork} small /><span>W<span>B</span></span></div><span className="record-center" /></div><span className="record-caption">33⅓ RPM <span>·</span> STEREO</span></div><div className="player-now"><span className="eyebrow player-eyebrow"><span className="live-dot" /> ANALOG HEART, DIGITAL SOUL</span><h1>{current.title}</h1><p>{current.artist} <span>·</span> {current.album}</p><Visualizer element={audioRef.current} active={playing} /><div className="progress-area"><input type="range" aria-label="Seek track" className="progress-range" min="0" max={duration || 1} value={Math.min(position, duration || 1)} onChange={event => { const n = Number(event.target.value); if (audioRef.current) audioRef.current.currentTime = n; setPosition(n) }} style={{ '--progress': `${duration ? position / duration * 100 : 0}%` } as React.CSSProperties} /><div className="progress-labels"><span>{timeLabel(position)}</span><span>−{timeLabel(Math.max(0, duration - position))}</span></div></div><div className="player-controls"><button className={`player-secondary ${shuffle ? 'control-active' : ''}`} aria-label="Shuffle" onClick={() => setShuffle(value => !value)}><Shuffle size={18} /></button><button className="player-skip" aria-label="Previous track" onClick={() => void stepTrack(-1)}><SkipBack size={20} fill="currentColor" /></button><button className="big-play" aria-label={playing ? 'Pause' : 'Play'} onClick={() => void togglePlay()}>{playing ? <Pause fill="currentColor" size={23} /> : <Play fill="currentColor" size={23} />}</button><button className="player-skip" aria-label="Next track" onClick={() => void stepTrack(1)}><SkipForward size={20} fill="currentColor" /></button><button className={`player-secondary ${repeat !== 'off' ? 'control-active' : ''}`} aria-label={`Repeat ${repeat}; click to change`} onClick={() => setRepeat(mode => mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off')}>{repeat === 'one' ? <Repeat1 size={18} /> : <Repeat size={18} />}</button></div><div className="player-extras"><button className="extra-icon" aria-label="Toggle favorite" onClick={() => void toggleFavorite(current)}><Heart size={17} fill={current.favorite ? 'currentColor' : 'none'} /><span>{current.favorite ? 'LOVED' : 'FAVORITE'}</span></button><div className="speed-control"><span>SPEED</span><select value={speed} aria-label="Playback speed" onChange={event => updateSpeed(Number(event.target.value))}><option value={0.75}>0.75×</option><option value={1}>1.0×</option><option value={1.25}>1.25×</option><option value={1.5}>1.5×</option></select><ChevronDown size={12} /></div><button className="extra-icon" onClick={() => setEqOpen(true)}><SlidersHorizontal size={16} /><span>EQUALIZER</span></button></div></div></div><div className="player-bottom"><span>♥ MADE FOR THE LONG WAY HOME</span><span><span className="status-dot" /> LOCAL AUDIO · NO SIGNAL NEEDED</span></div></div>}

    {eqOpen && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setEqOpen(false) }}><section className="eq-panel" aria-label="Equalizer and playback speed"><div className="modal-topline"><span className="eyebrow"><SlidersHorizontal size={13} /> SOUND SETTINGS</span><button className="icon-button" aria-label="Close sound settings" onClick={() => setEqOpen(false)}><X size={18} /></button></div><h2>Find your <em>frequency.</em></h2><p className="eq-description">Three bands. Your own kind of loud.</p><div className="eq-sliders">{(['bass', 'mid', 'treble'] as const).map((band, index) => <label key={band} className="eq-band"><span className="eq-band-head">{['BASS', 'MIDS', 'TREBLE'][index]}<strong>{eq[band] > 0 ? '+' : ''}{eq[band]} dB</strong></span><input className="eq-range" type="range" min="-12" max="12" step="1" value={eq[band]} style={{ '--progress': `${(eq[band] + 12) / 24 * 100}%` } as React.CSSProperties} onChange={event => updateEq(band, Number(event.target.value))} aria-label={`${band} equalizer`} /><span className="eq-band-hint">{['WARM LOW END', 'FULL & PRESENT', 'CRISP DETAIL'][index]}</span></label>)}</div><div className="eq-divider" /><div className="eq-presets"><span>PLAYBACK SPEED</span><div className="speed-options">{[0.75, 1, 1.25, 1.5].map(value => <button key={value} className={speed === value ? 'speed-option chosen' : 'speed-option'} onClick={() => updateSpeed(value)}>{value.toFixed(2).replace(/0$/, '')}×{speed === value && <Check size={12} />}</button>)}</div></div><button className="reset-button" onClick={resetEq}>RESET TO FLAT</button></section></div>}

    {playlistEditor && <div className="modal-backdrop" onClick={event => { if (event.target === event.currentTarget) setPlaylistEditor(null) }}><section className="playlist-modal"><div className="modal-topline"><span className="eyebrow"><ListMusic size={13} /> YOUR PLAYLIST</span><button className="icon-button" aria-label="Close" onClick={() => setPlaylistEditor(null)}><X size={18} /></button></div><h2>{playlistEditor.id ? 'A fresh name.' : 'Set the mood.'}</h2><p>Name this collection of little moments.</p><label className="playlist-name-label">PLAYLIST NAME<input autoFocus maxLength={40} placeholder="Late night frequencies" value={playlistEditor.name} onChange={event => setPlaylistEditor({ ...playlistEditor, name: event.target.value })} onKeyDown={event => { if (event.key === 'Enter') void editPlaylist(); if (event.key === 'Escape') setPlaylistEditor(null) }} /></label><button className="solid-button playlist-save" disabled={!playlistEditor.name.trim()} onClick={() => void editPlaylist()}>{playlistEditor.id ? <Check size={15} /> : <Plus size={15} />}{playlistEditor.id ? 'Save changes' : 'Create playlist'}</button></section></div>}

    <div className="mobile-tabs" aria-label="Main navigation"><button className={tab === 'library' ? 'mobile-tab selected' : 'mobile-tab'} onClick={() => { setTab('library'); setActivePlaylist(null); setFullPlayer(false) }}><Album size={16} /><span>LIBRARY</span></button><button className={fullPlayer ? 'mobile-tab selected' : 'mobile-tab'} onClick={() => { if (current) setFullPlayer(true); else if (tracks[0]) void playTrack(tracks[0]) }}><Disc3 size={16} /><span>PLAYING</span></button><button className={tab === 'playlists' ? 'mobile-tab selected' : 'mobile-tab'} onClick={() => { setTab('playlists'); setActivePlaylist(null); setFullPlayer(false) }}><ListMusic size={16} /><span>PLAYLISTS</span></button><button className="mobile-tab" onClick={() => setEqOpen(true)}><Settings2 size={16} /><span>EQ</span></button></div>
    {!current && <footer className="welcome-footer"><Headphones size={13} /> NO CLOUD. NO CATCH. JUST YOUR MUSIC.</footer>}
  </main>
}
