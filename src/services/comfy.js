/**
 * comfy.js — komunikasi ke ComfyUI API.
 * Flow: submit workflow → polling sampai selesai → ambil URL gambar
 */

const BASE_URL = '/comfy'
const DEFAULT_CHECKPOINT = import.meta.env.VITE_COMFY_CHECKPOINT || 'v1-5-pruned-emaonly.ckpt'

/**
 * Build workflow JSON untuk txt2img SD standard.
 * Struktur node graph ini adalah format native ComfyUI API.
 */
function buildTxt2ImgWorkflow({ prompt, negativePrompt = '', checkpoint, steps = 20, cfg = 7, width = 512, height = 512, seed = -1 }) {
  const actualSeed = seed === -1 ? Math.floor(Math.random() * 999999999) : seed

  return {
    // Node 1: Load checkpoint
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint || DEFAULT_CHECKPOINT }
    },
    // Node 2: CLIP encode positive prompt
    "2": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: prompt,
        clip: ["1", 1]  // output index 1 dari node 1 (CLIP)
      }
    },
    // Node 3: CLIP encode negative prompt
    "3": {
      class_type: "CLIPTextEncode",
      inputs: {
        text: negativePrompt || "blurry, bad quality, distorted, ugly, watermark",
        clip: ["1", 1]
      }
    },
    // Node 4: Empty latent image
    "4": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 }
    },
    // Node 5: KSampler
    "5": {
      class_type: "KSampler",
      inputs: {
        seed: actualSeed,
        steps,
        cfg,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1.0,
        model: ["1", 0],       // output 0 dari node 1 (MODEL)
        positive: ["2", 0],    // output 0 dari node 2 (CONDITIONING)
        negative: ["3", 0],    // output 0 dari node 3 (CONDITIONING)
        latent_image: ["4", 0] // output 0 dari node 4 (LATENT)
      }
    },
    // Node 6: VAE Decode
    "6": {
      class_type: "VAEDecode",
      inputs: {
        samples: ["5", 0],  // output 0 dari node 5 (LATENT)
        vae: ["1", 2]       // output 2 dari node 1 (VAE)
      }
    },
    // Node 7: Save image
    "7": {
      class_type: "SaveImage",
      inputs: {
        filename_prefix: "ollama-chat",
        images: ["6", 0]  // output 0 dari node 6 (IMAGE)
      }
    }
  }
}

/**
 * Submit prompt ke ComfyUI, return prompt_id
 */
async function submitPrompt(workflow) {
  const res = await fetch(`${BASE_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ComfyUI error: ${err}`)
  }
  const data = await res.json()
  return data.prompt_id
}

/**
 * Polling history sampai prompt selesai diproses.
 * Return array filename gambar yang dihasilkan.
 */
async function pollUntilDone(promptId, { onProgress, signal, intervalMs = 1000, timeoutMs = 120000 } = {}) {
  const start = Date.now()

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (Date.now() - start > timeoutMs) throw new Error('Timeout: ComfyUI tidak merespons dalam 2 menit')

    await new Promise((r) => setTimeout(r, intervalMs))

    const res = await fetch(`${BASE_URL}/history/${promptId}`)
    if (!res.ok) continue

    const history = await res.json()
    const entry = history[promptId]
    if (!entry) continue

    // Cek apakah ada error di queue
    if (entry.status?.status_str === 'error') {
      const msgs = entry.status?.messages || []
      const errMsg = msgs.find(([t]) => t === 'execution_error')?.[1]?.exception_message
      throw new Error(errMsg || 'ComfyUI execution error')
    }

    // Selesai — ambil output gambar
    if (entry.outputs) {
      const images = []
      for (const nodeId in entry.outputs) {
        const nodeOut = entry.outputs[nodeId]
        if (nodeOut.images) {
          images.push(...nodeOut.images)
        }
      }
      if (images.length > 0) return images
    }

    onProgress?.()
  }
}

/**
 * Build URL untuk view gambar dari ComfyUI
 */
export function buildImageUrl({ filename, subfolder = '', type = 'output' }) {
  const params = new URLSearchParams({ filename, subfolder, type })
  return `${BASE_URL}/view?${params}`
}

/**
 * Main function: generate gambar dari teks prompt
 * @param {object} options - { prompt, negativePrompt, checkpoint, steps, cfg, width, height, seed, onProgress, signal }
 * @returns {Promise<string[]>} - array image URL
 */
export async function generateImage(options) {
  const workflow = buildTxt2ImgWorkflow(options)
  const promptId = await submitPrompt(workflow)
  const images = await pollUntilDone(promptId, {
    onProgress: options.onProgress,
    signal: options.signal,
  })
  return images.map((img) => buildImageUrl(img))
}

/**
 * Cek apakah ComfyUI online
 */
export async function checkComfyStatus() {
  try {
    const res = await fetch(`${BASE_URL}/system_stats`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

/**
 * Ambil daftar checkpoint yang tersedia di ComfyUI
 */
export async function fetchCheckpoints() {
  try {
    const res = await fetch(`${BASE_URL}/object_info/CheckpointLoaderSimple`)
    if (!res.ok) return []
    const data = await res.json()
    return data?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || []
  } catch {
    return []
  }
}
