// Runs on the audio render thread; no microphone samples are sent to a server here.
class ExplorationAudio extends AudioWorkletProcessor {
  constructor() {
    super()
    this.samples = new Float32Array(2048)
    this.length = 0
    this.offset = 0
    this.stopped = false
    this.port.onmessage = ({ data }) => {
      if (data === 'stop') {
        this.flush()
        this.stopped = true
        this.port.postMessage({ stopped: true })
      }
    }
  }
  flush() {
    if (!this.length) return
    const samples = this.samples.slice(0, this.length)
    this.port.postMessage({ samples, offset: this.offset }, [samples.buffer])
    this.offset += this.length
    this.length = 0
  }
  process(inputs) {
    if (this.stopped) return false
    const channels = inputs[0]
    if (!channels?.length) return true
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0
      for (const channel of channels) value += channel[i]
      this.samples[this.length++] = value / channels.length
      if (this.length === this.samples.length) this.flush()
    }
    return true
  }
}
registerProcessor('ansight-exploration-audio', ExplorationAudio)
