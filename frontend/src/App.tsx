import { useCallback, useEffect, useRef, useState } from 'react'
import {
  SessionSocket,
  arrayBufferToBase64,
  floatTo16kPcm,
  type ModeState,
  type ServerMessage,
} from './session'
import { drawHandSkeleton } from './handOverlay'
import './App.css'

type AlertState = { message: string; confidence: number } | null

const MODE_PRESETS: { id: string; label: string; modes: ModeState }[] = [
  { id: 'all', label: 'الكل', modes: { receive: true, send: true, safety: true } },
  { id: 'receive', label: 'استقبال', modes: { receive: true, send: false, safety: false } },
  { id: 'send', label: 'إرسال', modes: { receive: false, send: true, safety: false } },
  { id: 'safety', label: 'سلامة', modes: { receive: false, send: false, safety: true } },
]

const SIGN_EMOJI: Record<string, string> = {
  مرحبا: '👋',
  نعم: '👍',
  لا: '✊',
  شكرا: '🤙',
  مساعدة: '🤙',
  ماء: '💧',
  طعام: '🍽️',
  أنا: '👆',
  أنت: '👉',
  حسنا: '👌',
  توقف: '🤘',
  واحد: '☝️',
  اثنان: '✌️',
  ثلاثة: '🤟',
  أربعة: '🖖',
  خمسة: '🖐️',
}

type VocabItem = { label: string; hint: string; emoji: string }

const DEFAULT_VOCAB: VocabItem[] = [
  { label: 'مرحبا', hint: 'كف مفتوح', emoji: '👋' },
  { label: 'نعم', hint: 'إبهام لأعلى', emoji: '👍' },
  { label: 'لا', hint: 'قبضة', emoji: '✊' },
  { label: 'شكرا', hint: 'إبهام وخنصر', emoji: '🤙' },
  { label: 'مساعدة', hint: 'خنصر', emoji: '✋' },
  { label: 'حسنا', hint: 'إشارة OK', emoji: '👌' },
  { label: 'واحد', hint: 'سبابة', emoji: '☝️' },
  { label: 'اثنان', hint: 'سبابة ووسطى', emoji: '✌️' },
  { label: 'ثلاثة', hint: 'ثلاث أصابع', emoji: '🤟' },
  { label: 'أربعة', hint: 'أربع أصابع', emoji: '🖖' },
  { label: 'خمسة', hint: 'خمس أصابع', emoji: '🖐️' },
]

function emojiForLabel(label: string): string {
  return SIGN_EMOJI[label] ?? '🤟'
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLCanvasElement>(null)
  const socketRef = useRef<SessionSocket | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const frameTimerRef = useRef<number | null>(null)
  const handLoopRef = useRef<number | null>(null)
  const activeRef = useRef(false)
  const modesRef = useRef<ModeState>({ receive: true, send: true, safety: true })
  const lastHandTsRef = useRef(0)

  const [running, setRunning] = useState(false)
  const [status, setStatus] = useState<'idle' | 'connecting' | 'open' | 'closed' | 'error'>('idle')
  const [modes, setModes] = useState<ModeState>({ receive: true, send: true, safety: true })
  const [preset, setPreset] = useState('all')
  const [caption, setCaption] = useState('بانتظار الكلام…')
  const [captions, setCaptions] = useState<string[]>([])
  const [signLabel, setSignLabel] = useState<string | null>(null)
  const [signConf, setSignConf] = useState(0)
  const [alert, setAlert] = useState<AlertState>(null)
  const [vocabHints, setVocabHints] = useState<VocabItem[]>(DEFAULT_VOCAB)
  const [error, setError] = useState<string | null>(null)

  const playTts = useCallback((mime: string, b64: string) => {
    const audio = new Audio(`data:${mime};base64,${b64}`)
    void audio.play().catch(() => {
      /* autoplay may fail until user gesture — session already started by user */
    })
  }, [])

  const paintHand = useCallback((landmarks: { x: number; y: number }[]) => {
    const overlay = overlayRef.current
    const video = videoRef.current
    if (!overlay || !video) return
    const rect = video.getBoundingClientRect()
    const w = Math.round(rect.width) || video.clientWidth || 640
    const h = Math.round(rect.height) || video.clientHeight || 360
    if (overlay.width !== w || overlay.height !== h) {
      overlay.width = w
      overlay.height = h
    }
    const ctx = overlay.getContext('2d')
    if (!ctx) return
    drawHandSkeleton(
      ctx,
      landmarks,
      w,
      h,
      video.videoWidth || w,
      video.videoHeight || h,
    )
  }, [])

  const stopHandLoop = useCallback(() => {
    if (handLoopRef.current != null) {
      cancelAnimationFrame(handLoopRef.current)
      handLoopRef.current = null
    }
  }, [])

  const startHandLoop = useCallback(() => {
    stopHandLoop()
    const tick = async () => {
      if (!activeRef.current) return
      const video = videoRef.current
      if (video && modesRef.current.send) {
        try {
          // MediaPipe requires strictly increasing timestamps
          const now = performance.now()
          if (now <= lastHandTsRef.current) {
            lastHandTsRef.current += 1
          } else {
            lastHandTsRef.current = now
          }
          const { detectHandLandmarks } = await import('./localHandTracker')
          const landmarks = await detectHandLandmarks(video, lastHandTsRef.current)
          paintHand(landmarks)
        } catch {
          /* keep loop alive if a frame fails */
        }
      } else {
        paintHand([])
      }
      handLoopRef.current = requestAnimationFrame(() => {
        void tick()
      })
    }
    handLoopRef.current = requestAnimationFrame(() => {
      void tick()
    })
  }, [paintHand, stopHandLoop])

  const handleMessage = useCallback(
    (msg: ServerMessage) => {
      if (msg.type === 'ready') {
        if (msg.hints && Object.keys(msg.hints).length) {
          setVocabHints(
            Object.entries(msg.hints).map(([label, hint]) => ({
              label,
              hint,
              emoji: emojiForLabel(label),
            })),
          )
        } else if (msg.vocab?.length) {
          setVocabHints(
            msg.vocab.map((label) => ({
              label,
              hint: '',
              emoji: emojiForLabel(label),
            })),
          )
        }
        return
      }
      if (msg.type === 'caption') {
        setCaption(msg.text)
        setCaptions((prev) => [...prev.slice(-4), msg.text])
        return
      }
      // Hand overlay is drawn locally for low latency — ignore server landmarks
      if (msg.type === 'hand') {
        return
      }
      if (msg.type === 'sign') {
        setSignLabel(msg.label)
        setSignConf(msg.confidence)
        return
      }
      if (msg.type === 'tts') {
        playTts(msg.mime, msg.data)
        return
      }
      if (msg.type === 'alert') {
        setAlert({ message: msg.message, confidence: msg.confidence })
        window.setTimeout(() => setAlert(null), 4500)
        return
      }
      if (msg.type === 'error') {
        setError(msg.message)
      }
    },
    [playTts],
  )

  const stopMedia = useCallback(() => {
    activeRef.current = false
    stopHandLoop()
    if (frameTimerRef.current) {
      window.clearInterval(frameTimerRef.current)
      frameTimerRef.current = null
    }
    processorRef.current?.disconnect()
    processorRef.current = null
    void audioCtxRef.current?.close()
    audioCtxRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    paintHand([])
  }, [paintHand, stopHandLoop])

  const stopSession = useCallback(() => {
    stopMedia()
    socketRef.current?.close()
    socketRef.current = null
    setRunning(false)
    setStatus('closed')
  }, [stopMedia])

  const startSession = useCallback(async () => {
    setError(null)
    setStatus('connecting')

    const socket = new SessionSocket(handleMessage, (s) => setStatus(s))
    socketRef.current = socket
    socket.connect()

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }

      // Warm local MediaPipe tracker for smooth hand overlay (lazy load)
      try {
        const { warmupHandTracker } = await import('./localHandTracker')
        await warmupHandTracker()
      } catch (err) {
        console.warn('Hand tracker warmup failed', err)
      }

      const audioCtx = new AudioContext()
      audioCtxRef.current = audioCtx
      const source = audioCtx.createMediaStreamSource(stream)
      const processor = audioCtx.createScriptProcessor(4096, 1, 1)
      processorRef.current = processor
      const inputRate = audioCtx.sampleRate

      processor.onaudioprocess = (ev) => {
        if (!activeRef.current || !socketRef.current) return
        const m = modesRef.current
        if (!m.receive && !m.safety) return
        const input = ev.inputBuffer.getChannelData(0)
        const pcm = floatTo16kPcm(input, inputRate)
        const b64 = arrayBufferToBase64(
          new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
        )
        socketRef.current.sendAudioBase64(b64)
      }
      source.connect(processor)
      const mute = audioCtx.createGain()
      mute.gain.value = 0
      processor.connect(mute)
      mute.connect(audioCtx.destination)

      // Frames to backend for sign classification (overlay is local / realtime)
      frameTimerRef.current = window.setInterval(() => {
        if (!activeRef.current || !modesRef.current.send) return
        const video = videoRef.current
        const canvas = canvasRef.current
        if (!video || !canvas || video.readyState < 2) return
        const w = 320
        const h = Math.round((video.videoHeight / video.videoWidth) * w) || 240
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.drawImage(video, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.7)
        const b64 = dataUrl.split(',')[1]
        if (b64) socketRef.current?.sendFrameBase64(b64)
      }, 350)

      activeRef.current = true
      startHandLoop()
      setRunning(true)
      window.setTimeout(() => {
        socket.setModes(modesRef.current, 16000)
      }, 400)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر الوصول للكاميرا أو الميكروفون')
      stopSession()
    }
  }, [handleMessage, startHandLoop, stopSession])

  useEffect(() => {
    modesRef.current = modes
    if (!running || !socketRef.current) return
    socketRef.current.setModes(modes, 16000)
  }, [modes, running])

  useEffect(() => () => stopSession(), [stopSession])

  const applyPreset = (id: string) => {
    const found = MODE_PRESETS.find((p) => p.id === id)
    if (!found) return
    setPreset(id)
    setModes(found.modes)
  }

  const statusLabel =
    status === 'open'
      ? 'متصل'
      : status === 'connecting'
        ? 'جارٍ الاتصال…'
        : status === 'error'
          ? 'خطأ في الاتصال'
          : status === 'closed'
            ? 'غير متصل'
            : 'جاهز'

  return (
    <div className="app">
      <header className="top">
        <div className="brand-block">
          <p className="eyebrow">كاميرا اللابتوب · بديل النظارة الذكية</p>
          <h1 className="brand">تواصل ذكي</h1>
          <p className="tagline">للصم والبكم — كلام، إشارة، وتنبيهات سلامة</p>
        </div>
        <div className="status-pill" data-state={status}>
          <span className="dot" />
          {statusLabel}
        </div>
      </header>

      {alert && (
        <div className="safety-banner" role="alert">
          <strong>{alert.message}</strong>
          <span>{Math.round(alert.confidence * 100)}%</span>
        </div>
      )}

      <main className="stage">
        <div className="viewport">
          <video ref={videoRef} className="camera" playsInline muted autoPlay />
          <canvas ref={overlayRef} className="hand-overlay" />
          <canvas ref={canvasRef} className="hidden-canvas" />

          <div className="overlay-bottom">
            <div className="caption" key={caption}>
              {modes.receive ? caption : 'وضع الاستقبال متوقف'}
            </div>
          </div>

          {signLabel && modes.send && (
            <div className="sign-chip">
              <span className="sign-emoji" aria-hidden>
                {emojiForLabel(signLabel)}
              </span>
              <span className="sign-label">{signLabel}</span>
              <span className="sign-meta">{Math.round(signConf * 100)}%</span>
            </div>
          )}
        </div>

        <aside className="side">
          <section className="panel">
            <h2>الأوضاع</h2>
            <div className="presets">
              {MODE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={preset === p.id ? 'active' : ''}
                  onClick={() => applyPreset(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="toggles">
              <label>
                <input
                  type="checkbox"
                  checked={modes.receive}
                  onChange={(e) => {
                    setPreset('custom')
                    setModes((m) => ({ ...m, receive: e.target.checked }))
                  }}
                />
                استقبال (كلام → نص)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={modes.send}
                  onChange={(e) => {
                    setPreset('custom')
                    setModes((m) => ({ ...m, send: e.target.checked }))
                  }}
                />
                إرسال (إشارة → صوت)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={modes.safety}
                  onChange={(e) => {
                    setPreset('custom')
                    setModes((m) => ({ ...m, safety: e.target.checked }))
                  }}
                />
                سلامة (أصوات البيئة)
              </label>
            </div>
          </section>

          <section className="panel actions">
            {!running ? (
              <button type="button" className="primary" onClick={() => void startSession()}>
                بدء الجلسة
              </button>
            ) : (
              <button type="button" className="danger" onClick={stopSession}>
                إيقاف
              </button>
            )}
            {error && <p className="error">{error}</p>}
          </section>

          <section className="panel">
            <h2>سجل الترجمة</h2>
            <ul className="log">
              {captions.length === 0 && <li className="muted">لا توجد عبارات بعد</li>}
              {captions.map((c, i) => (
                <li key={`${i}-${c}`}>{c}</li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h2>مفردات الإشارة</h2>
            <ul className="hints">
              {vocabHints.map((item) => (
                <li key={item.label} className="hint-item">
                  <span className="hint-emoji" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="hint-text">
                    <strong>{item.label}</strong>
                    {item.hint ? <span className="hint-desc"> — {item.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            <p className="hint-note">أظهر يدك أمام الكاميرا بوضوح وبثبات قصير.</p>
          </section>
        </aside>
      </main>
    </div>
  )
}
