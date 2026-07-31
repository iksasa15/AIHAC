export type ServerMessage =
  | { type: 'ready'; vocab: string[]; hints?: Record<string, string>; message: string }
  | { type: 'config_ack'; modes: { receive: boolean; send: boolean; safety: boolean } }
  | { type: 'caption'; text: string; ts: number }
  | { type: 'hand'; landmarks: { x: number; y: number }[]; ts: number }
  | { type: 'sign'; key: string; label: string; confidence: number; ts: number }
  | { type: 'tts'; label: string; mime: string; data: string; ts: number }
  | { type: 'alert'; key: string; message: string; confidence: number; ts: number }
  | { type: 'error'; message: string }
  | { type: 'pong'; ts: number }

export type ModeState = {
  receive: boolean
  send: boolean
  safety: boolean
}

function wsUrl(): string {
  // Full WebSocket URL for production hosting (Railway, etc.)
  const explicit = import.meta.env.VITE_WS_URL as string | undefined
  if (explicit) {
    return explicit.replace(/\/$/, '')
  }

  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  // In Vite dev, proxy /ws to backend
  if (import.meta.env.DEV) {
    return `${proto}://${window.location.host}/ws/session`
  }
  const host = import.meta.env.VITE_WS_HOST || window.location.hostname
  const port = import.meta.env.VITE_WS_PORT
  if (port) {
    return `${proto}://${host}:${port}/ws/session`
  }
  return `${proto}://${host}/ws/session`
}

export class SessionSocket {
  private ws: WebSocket | null = null
  private onMessage: (msg: ServerMessage) => void
  private onStatus: (status: 'connecting' | 'open' | 'closed' | 'error') => void

  constructor(
    onMessage: (msg: ServerMessage) => void,
    onStatus: (status: 'connecting' | 'open' | 'closed' | 'error') => void,
  ) {
    this.onMessage = onMessage
    this.onStatus = onStatus
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return
    }
    this.onStatus('connecting')
    const ws = new WebSocket(wsUrl())
    this.ws = ws
    ws.onopen = () => this.onStatus('open')
    ws.onclose = () => this.onStatus('closed')
    ws.onerror = () => this.onStatus('error')
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string) as ServerMessage
        this.onMessage(msg)
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    this.ws?.close()
    this.ws = null
  }

  send(obj: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(obj))
    }
  }

  setModes(modes: ModeState, sampleRate = 16000) {
    this.send({ type: 'config', ...modes, sampleRate })
  }

  sendAudioBase64(data: string) {
    this.send({ type: 'audio', data })
  }

  sendFrameBase64(data: string) {
    this.send({ type: 'frame', data })
  }
}

export function arrayBufferToBase64(buffer: ArrayBufferLike | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer as ArrayBuffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** Downsample Float32 PCM to 16kHz Int16 PCM */
export function floatTo16kPcm(input: Float32Array, inputRate: number): Int16Array {
  if (inputRate === 16000) {
    const out = new Int16Array(input.length)
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]))
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    return out
  }
  const ratio = inputRate / 16000
  const newLen = Math.floor(input.length / ratio)
  const out = new Int16Array(newLen)
  for (let i = 0; i < newLen; i++) {
    const idx = Math.floor(i * ratio)
    const s = Math.max(-1, Math.min(1, input[idx] ?? 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}
