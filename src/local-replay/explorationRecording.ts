import type { TranscriptSegment } from './recordingTranscript'

export type SpeechSegment = { samples: Float32Array; startSample: number; endSample: number }

// Keep a short pre-roll so detecting a phrase never clips its first consonant.
export class SpeechSegmenter {
  private buffered: { samples: Float32Array; offset: number }[] = []
  private speaking = false
  private lastVoice = 0
  readonly sampleRate: number
  private emit: (segment: SpeechSegment) => void
  constructor(sampleRate: number, emit: (segment: SpeechSegment) => void) { this.sampleRate = sampleRate; this.emit = emit }
  push(samples: Float32Array, offset: number) {
    const end = offset + samples.length
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
    this.buffered.push({ samples, offset })
    if (rms >= 0.008) { this.speaking = true; this.lastVoice = end }
    if (!this.speaking) {
      while (this.buffered.length > 1 && end - this.buffered[0].offset > this.sampleRate * 0.3) this.buffered.shift()
      return
    }
    if (end - this.lastVoice >= this.sampleRate * 0.7 || end - this.buffered[0].offset >= this.sampleRate * 20) this.flush()
  }
  flush() {
    if (!this.speaking || !this.buffered.length) { this.buffered = []; return }
    const startSample = this.buffered[0].offset
    const last = this.buffered[this.buffered.length - 1]
    const endSample = last.offset + last.samples.length
    const samples = new Float32Array(endSample - startSample)
    for (const part of this.buffered) samples.set(part.samples, part.offset - startSample)
    this.buffered = []; this.speaking = false
    this.emit({ samples, startSample, endSample })
  }
}

export function transcriptSegment(startedAt: number, rate: number, segment: SpeechSegment, text: string): TranscriptSegment {
  return {
    segmentId: String(segment.startSample),
    startUtc: new Date(startedAt + segment.startSample / rate * 1000).toISOString(),
    endUtc: new Date(startedAt + segment.endSample / rate * 1000).toISOString(),
    text,
  }
}

export async function resampleSpeech(samples: Float32Array, rate: number): Promise<Float32Array> {
  if (rate === 16000) return samples
  const renderer = new OfflineAudioContext(1, Math.ceil(samples.length * 16000 / rate), 16000)
  const buffer = renderer.createBuffer(1, samples.length, rate)
  buffer.copyToChannel(new Float32Array(samples), 0)
  const source = renderer.createBufferSource()
  source.buffer = buffer; source.connect(renderer.destination); source.start()
  return (await renderer.startRendering()).getChannelData(0)
}
