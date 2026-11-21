// Canonical mono PCM16 WAV: the host needs no audio codecs or external process.
export function encodeVoiceWav(samples: Float32Array): Blob {
  if (!samples.length || samples.length > 16000 * 120) throw new Error('Record a comment of up to two minutes.')
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE')
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, 1, true); view.setUint32(24, 16000, true); view.setUint32(28, 32000, true)
  view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples.length * 2, true)
  samples.forEach((value, index) => {
    const sample = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0
    view.setInt16(44 + index * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true)
  })
  return new Blob([buffer], { type: 'audio/wav' })
}

export async function prepareVoiceAudio(recording: Blob): Promise<Blob> {
  const context = new AudioContext()
  try {
    const decoded = await context.decodeAudioData(await recording.arrayBuffer())
    if (!decoded.length || decoded.duration > 121) throw new Error('Record a comment of up to two minutes.')
    // MediaRecorder can deliver its final chunk just after the two-minute timer.
    const frames = Math.min(16000 * 120, Math.ceil(decoded.duration * 16000))
    const renderer = new OfflineAudioContext(1, frames, 16000)
    const source = renderer.createBufferSource()
    source.buffer = decoded
    source.connect(renderer.destination)
    source.start()
    return encodeVoiceWav((await renderer.startRendering()).getChannelData(0))
  } finally { await context.close() }
}
