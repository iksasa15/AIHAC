import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { Landmark } from './handOverlay'

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.18/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

let landmarkerPromise: Promise<HandLandmarker> | null = null
let landmarkerFailed = false

async function getLandmarker(): Promise<HandLandmarker | null> {
  if (landmarkerFailed) return null
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)
      try {
        return await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      } catch {
        return HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: MODEL_URL,
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        })
      }
    })().catch((err) => {
      landmarkerFailed = true
      landmarkerPromise = null
      console.warn('Hand landmarker failed to load', err)
      throw err
    })
  }
  try {
    return await landmarkerPromise
  } catch {
    return null
  }
}

export async function detectHandLandmarks(
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<Landmark[]> {
  if (video.readyState < 2 || video.videoWidth === 0) return []
  const landmarker = await getLandmarker()
  if (!landmarker) return []
  const result = landmarker.detectForVideo(video, timestampMs)
  const hand = result.landmarks?.[0]
  if (!hand?.length) return []
  return hand.map((p) => ({ x: p.x, y: p.y }))
}

export async function warmupHandTracker(): Promise<void> {
  await getLandmarker()
}
