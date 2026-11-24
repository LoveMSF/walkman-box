export interface Equalizer { bass: number; mid: number; treble: number }

let context: AudioContext | undefined
let source: MediaElementAudioSourceNode | undefined
let filters: BiquadFilterNode[] = []
let analyser: AnalyserNode | undefined

export function audioGraph(element: HTMLAudioElement) {
  if (!context) {
    context = new AudioContext()
    source = context.createMediaElementSource(element)
    const bass = context.createBiquadFilter()
    bass.type = 'lowshelf'; bass.frequency.value = 200
    const mid = context.createBiquadFilter()
    mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 0.8
    const treble = context.createBiquadFilter()
    treble.type = 'highshelf'; treble.frequency.value = 4000
    analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.84
    source.connect(bass).connect(mid).connect(treble).connect(analyser).connect(context.destination)
    filters = [bass, mid, treble]
  }
  return { context: context!, analyser: analyser! }
}

export function resumeAudio() { return context?.state === 'suspended' ? context.resume() : Promise.resolve() }

export function setEqualizer(values: Equalizer) {
  const settings = [values.bass, values.mid, values.treble]
  filters.forEach((filter, i) => { filter.gain.setTargetAtTime(settings[i], context!.currentTime, 0.08) })
}

function encodeWave(seconds: number, tone: number, seed: number): Blob {
  const rate = 22050
  const frames = Math.floor(rate * seconds)
  const buffer = new ArrayBuffer(44 + frames * 2)
  const view = new DataView(buffer)
  const ascii = (offset: number, text: string) => [...text].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  ascii(0, 'RIFF'); view.setUint32(4, 36 + frames * 2, true); ascii(8, 'WAVE'); ascii(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true)
  view.setUint16(34, 16, true); ascii(36, 'data'); view.setUint32(40, frames * 2, true)
  for (let i = 0; i < frames; i++) {
    const t = i / rate
    const beat = 1 + Math.sin(t * Math.PI * 2 / 0.74) * 0.1
    const bass = Math.sin(t * Math.PI * 2 * (tone / 2)) * 0.3
    const lead = Math.sin(t * Math.PI * 2 * tone) * 0.18
    const arpeggio = Math.sin(t * Math.PI * 2 * tone * (1.25 + (Math.floor(t / 0.37) % 4) * 0.25)) * 0.08
    const pad = Math.sin(t * Math.PI * 2 * tone * 0.251 + seed) * 0.12 + Math.sin(t * Math.PI * 2 * tone * 0.334) * 0.1
    const fade = Math.min(1, t * 1.5, (seconds - t) * 1.5)
    view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, (bass + lead + arpeggio + pad) * beat * fade)) * 32767), true)
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

export const DEMOS: Omit<import('./storage').Track, 'audio'>[] = [
  { id: 'demo-afterglow', title: 'Afterglow Protocol', artist: 'Neon Parcels', album: 'MIDNIGHT FREQUENCIES', format: 'WAV', size: 0, duration: 48, favorite: false, artwork: 'sunset', demo: true, addedAt: 1 },
  { id: 'demo-nightdrive', title: 'Night Drive 84', artist: 'Static Bloom', album: 'CITY LIMITS', format: 'WAV', size: 0, duration: 48, favorite: false, artwork: 'moon', demo: true, addedAt: 2 },
]

export async function createDemoTracks() {
  return DEMOS.map((demo, index) => ({ ...demo, audio: encodeWave(48, index === 0 ? 220 : 196, index * 0.8) }))
}
