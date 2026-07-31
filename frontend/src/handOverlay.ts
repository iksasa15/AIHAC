/** MediaPipe-style hand skeleton connections (21 landmarks). */
export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [0, 17],
  [17, 18],
  [18, 19],
  [19, 20],
]

export type Landmark = { x: number; y: number }

export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: Landmark[],
  width: number,
  height: number,
  videoWidth = 0,
  videoHeight = 0,
) {
  ctx.clearRect(0, 0, width, height)
  if (!landmarks.length) return

  const vw = videoWidth || width
  const vh = videoHeight || height
  const videoAspect = vw / vh
  const canvasAspect = width / height
  let scale: number
  let offsetX = 0
  let offsetY = 0
  if (videoAspect > canvasAspect) {
    scale = height / vh
    offsetX = (width - vw * scale) / 2
  } else {
    scale = width / vw
    offsetY = (height - vh * scale) / 2
  }

  const pts = landmarks.map((p) => ({
    x: p.x * vw * scale + offsetX,
    y: p.y * vh * scale + offsetY,
  }))

  ctx.lineWidth = Math.max(2.5, width * 0.006)
  ctx.lineCap = 'round'
  ctx.strokeStyle = 'rgba(46, 196, 182, 0.95)'
  ctx.shadowColor = 'rgba(46, 196, 182, 0.55)'
  ctx.shadowBlur = 8

  for (const [a, b] of HAND_CONNECTIONS) {
    if (!pts[a] || !pts[b]) continue
    ctx.beginPath()
    ctx.moveTo(pts[a].x, pts[a].y)
    ctx.lineTo(pts[b].x, pts[b].y)
    ctx.stroke()
  }

  ctx.shadowBlur = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const isTip = i === 4 || i === 8 || i === 12 || i === 16 || i === 20
    const r = isTip ? Math.max(5, width * 0.012) : Math.max(3.5, width * 0.008)
    ctx.beginPath()
    ctx.fillStyle = isTip ? '#ff9f1c' : '#f4f7f5'
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(12, 40, 48, 0.65)'
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
}
