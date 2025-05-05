import { type DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm'

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096
const INT16_MAX_VALUE = 0x7fff

// --- State Variables ---
let isGenerating = false
let isDenoisingEnabled = false
let isPlaying = false
let audioContext: AudioContext | null = null
let rnnoise: Rnnoise | null = null
let denoiseState: DenoiseState | null = null
let scriptProcessor: ScriptProcessorNode | null = null
let requestAnimationFrameId: number | null = null
let originalCanvasCtx: CanvasRenderingContext2D | null = null
let processedCanvasCtx: CanvasRenderingContext2D | null = null
let originalCanvas: HTMLCanvasElement | null = null
let processedCanvas: HTMLCanvasElement | null = null
let frameSize = 480
let lastNoiseValue = 0
let noiseGenerationScale = 0.2
let noiseGenerationAlpha = 0.5

// Buffers
let audioBufferOriginal = new Float32Array(frameSize)
let audioBufferProcessed = new Float32Array(frameSize)
let audioBufferReadIndex = frameSize

// UI Elements
let generateButton: HTMLButtonElement | null = null
let denoiseButton: HTMLButtonElement | null = null
let playbackButton: HTMLButtonElement | null = null
let noiseScaleSlider: HTMLInputElement | null = null
let noiseScaleValueSpan: HTMLSpanElement | null = null
let noiseAlphaSlider: HTMLInputElement | null = null
let noiseAlphaValueSpan: HTMLSpanElement | null = null

async function init() {
  originalCanvas = document.getElementById('original-waveform') as HTMLCanvasElement
  processedCanvas = document.getElementById('processed-waveform') as HTMLCanvasElement
  if (originalCanvas) {
    originalCanvasCtx = originalCanvas.getContext('2d')
  }
  if (processedCanvas) {
    processedCanvasCtx = processedCanvas.getContext('2d')
  }

  generateButton = document.getElementById('toggleGenerateButton') as HTMLButtonElement
  denoiseButton = document.getElementById('toggleDenoiseButton') as HTMLButtonElement
  playbackButton = document.getElementById('togglePlaybackButton') as HTMLButtonElement
  noiseScaleSlider = document.getElementById('noiseScaleSlider') as HTMLInputElement
  noiseScaleValueSpan = document.getElementById('noiseScaleValue') as HTMLSpanElement
  noiseAlphaSlider = document.getElementById('noiseAlphaSlider') as HTMLInputElement
  noiseAlphaValueSpan = document.getElementById('noiseAlphaValue') as HTMLSpanElement

  if (
    !generateButton ||
    !denoiseButton ||
    !playbackButton ||
    !noiseScaleSlider ||
    !noiseScaleValueSpan ||
    !noiseAlphaSlider ||
    !noiseAlphaValueSpan
  ) {
    console.error('Control elements not found!')
    alert('Initialization failed: Control elements missing.')
    if (generateButton) generateButton.disabled = true
    if (denoiseButton) denoiseButton.disabled = true
    if (playbackButton) playbackButton.disabled = true
    if (noiseScaleSlider) noiseScaleSlider.disabled = true
    if (noiseAlphaSlider) noiseAlphaSlider.disabled = true
    return
  }

  try {
    rnnoise = await Rnnoise.load()
    frameSize = rnnoise.frameSize
    audioBufferOriginal = new Float32Array(frameSize)
    audioBufferProcessed = new Float32Array(frameSize)
    audioBufferReadIndex = frameSize
    console.log(`RNNoise WASM loaded. Frame size: ${frameSize}`)
    generateButton.disabled = false
  } catch (error) {
    console.error('Failed to load RNNoise WASM:', error)
    alert('Failed to load RNNoise WASM. Check console.')
    generateButton.disabled = true
    denoiseButton.disabled = true
    playbackButton.disabled = true
    noiseScaleSlider.disabled = true
    noiseAlphaSlider.disabled = true
    return
  }

  generateButton.addEventListener('click', toggleGeneration)
  denoiseButton.addEventListener('click', toggleDenoising)
  playbackButton.addEventListener('click', togglePlayback)

  noiseScaleSlider.value = String(noiseGenerationScale)
  noiseScaleValueSpan.textContent = noiseGenerationScale.toFixed(2)
  noiseScaleSlider.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    noiseGenerationScale = Number.parseFloat(target.value)
    if (noiseScaleValueSpan) {
      noiseScaleValueSpan.textContent = noiseGenerationScale.toFixed(2)
    }
  })

  noiseAlphaSlider.value = String(noiseGenerationAlpha)
  noiseAlphaValueSpan.textContent = noiseGenerationAlpha.toFixed(2)
  noiseAlphaSlider.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement
    noiseGenerationAlpha = Number.parseFloat(target.value)
    if (noiseAlphaValueSpan) {
      noiseAlphaValueSpan.textContent = noiseGenerationAlpha.toFixed(2)
    }
  })

  updateButtonLabelsAndState()
}

function toggleGeneration() {
  isGenerating = !isGenerating
  if (isGenerating) {
    startGenerating()
  } else {
    stopGenerating()
  }
  updateButtonLabelsAndState()
}

function toggleDenoising() {
  if (!isGenerating) return
  isDenoisingEnabled = !isDenoisingEnabled
  if (isDenoisingEnabled) {
    createDenoiseState()
  } else {
    destroyDenoiseState()
  }
  updateButtonLabelsAndState()
}

function togglePlayback() {
  if (!isGenerating) {
    console.warn('[togglePlayback] Not generating, cannot toggle playback.')
    return
  }
  isPlaying = !isPlaying
  if (isPlaying) {
    startAudioPlayback()
  } else {
    stopAudioPlayback()
  }
  updateButtonLabelsAndState()
}

function startGenerating() {
  isGenerating = true
  lastNoiseValue = 0
  audioBufferReadIndex = frameSize

  if (isDenoisingEnabled && !denoiseState) {
    createDenoiseState()
  }

  processLoop()
}

function stopGenerating() {
  isGenerating = false
  if (isPlaying) {
    stopAudioPlayback()
  }
  if (requestAnimationFrameId !== null) {
    cancelAnimationFrame(requestAnimationFrameId)
    requestAnimationFrameId = null
  }
  destroyDenoiseState()
  clearCanvas(originalCanvasCtx, originalCanvas)
  clearCanvas(processedCanvasCtx, processedCanvas)
}

function startAudioPlayback() {
  if (!isGenerating || !rnnoise) {
    console.error(
      '[startAudioPlayback] Cannot start playback: Not generating or RNNoise not loaded.',
    )
    isPlaying = false
    updateButtonLabelsAndState()
    return
  }
  isPlaying = true

  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext({ sampleRate: 48000 })
    console.log('[startAudioPlayback] AudioContext created. State:', audioContext.state)
  }
  if (audioContext.state === 'suspended') {
    audioContext
      .resume()
      .then(() =>
        console.log('[startAudioPlayback] AudioContext resumed. State:', audioContext?.state),
      )
      .catch((err) => console.error('[startAudioPlayback] Failed to resume AudioContext:', err))
  }

  if (audioContext.sampleRate !== 48000) {
    console.warn(
      `AudioContext sample rate is ${audioContext.sampleRate}, not 48000. RNNoise might not work as expected.`,
    )
  }

  scriptProcessor = audioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
  scriptProcessor.onaudioprocess = handleAudioProcess
  scriptProcessor.connect(audioContext.destination)
  console.log('[startAudioPlayback] ScriptProcessorNode connected for playback.')

  audioBufferReadIndex = frameSize
}

function stopAudioPlayback() {
  isPlaying = false

  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor.onaudioprocess = null
    scriptProcessor = null
    console.log('ScriptProcessorNode disconnected.')
  }
}

function handleAudioProcess(event: AudioProcessingEvent) {
  if (!isPlaying || !scriptProcessor) return

  const outputBuffer = event.outputBuffer.getChannelData(0)
  const bufferSizeNode = outputBuffer.length

  for (let i = 0; i < bufferSizeNode; i++) {
    if (audioBufferReadIndex >= frameSize) {
      generateAndProcessFrame()

      if (audioBufferReadIndex >= frameSize) {
        // Buffer still empty after generation, output silence
        outputBuffer[i] = 0
        continue
      }
    }

    const sourceBuffer = isDenoisingEnabled ? audioBufferProcessed : audioBufferOriginal
    outputBuffer[i] = sourceBuffer[audioBufferReadIndex]
    audioBufferReadIndex++
  }
}

function generateAndProcessFrame() {
  if (!rnnoise) return

  // Generate noise
  for (let i = 0; i < frameSize; i++) {
    const whiteNoise = (Math.random() * 2 - 1) * noiseGenerationScale
    audioBufferOriginal[i] =
      noiseGenerationAlpha * whiteNoise + (1 - noiseGenerationAlpha) * lastNoiseValue
    lastNoiseValue = audioBufferOriginal[i]
  }

  // Process with RNNoise if enabled
  if (isDenoisingEnabled && denoiseState) {
    const tempProcessingFrame = new Float32Array(audioBufferOriginal)
    for (let i = 0; i < frameSize; i++) {
      tempProcessingFrame[i] *= INT16_MAX_VALUE
    }
    denoiseState.processFrame(tempProcessingFrame)

    // Copy processed data back, scaling down and clamping
    for (let i = 0; i < frameSize; i++) {
      audioBufferProcessed[i] = Math.max(
        -1.0,
        Math.min(1.0, tempProcessingFrame[i] / INT16_MAX_VALUE),
      )
    }
  } else {
    // If denoising is off, copy original to processed buffer
    audioBufferProcessed.set(audioBufferOriginal)
  }
  audioBufferReadIndex = 0
}

function processLoop() {
  if (!isGenerating) return

  generateAndProcessFrame()

  // Draw waveforms
  if (originalCanvasCtx && originalCanvas) {
    // Original waveform remains black
    drawWaveformFrame(originalCanvasCtx, originalCanvas, audioBufferOriginal, 'black')
  }
  if (processedCanvasCtx && processedCanvas) {
    // Processed waveform color depends on denoise state
    const processedColor = isDenoisingEnabled ? 'blue' : 'red'
    drawWaveformFrame(processedCanvasCtx, processedCanvas, audioBufferProcessed, processedColor)
  }

  requestAnimationFrameId = requestAnimationFrame(processLoop)
}

function createDenoiseState() {
  if (!denoiseState && rnnoise) {
    denoiseState = rnnoise.createDenoiseState()
    console.log('Denoise state created.')
  }
}

function destroyDenoiseState() {
  if (denoiseState) {
    denoiseState.destroy()
    denoiseState = null
    console.log('Denoise state destroyed.')
  }
}

function clearCanvas(ctx: CanvasRenderingContext2D | null, canvas: HTMLCanvasElement | null) {
  if (ctx && canvas) {
    ctx.fillStyle = 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
  }
}

function updateButtonLabelsAndState() {
  if (!generateButton || !denoiseButton || !playbackButton) return

  generateButton.textContent = isGenerating ? 'Stop Generating' : 'Start Generating'
  denoiseButton.disabled = !isGenerating
  denoiseButton.textContent = isDenoisingEnabled ? 'Disable Denoise' : 'Enable Denoise'
  playbackButton.disabled = !isGenerating
  playbackButton.textContent = isPlaying ? 'Stop Playback' : 'Start Playback'
}

function drawWaveformFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: Float32Array,
  color: string,
) {
  const width = canvas.width
  const height = canvas.height
  const amp = height / 2
  const frameLength = data.length

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()

  const scaleX = width / frameLength
  let y = Number.isFinite(data[0]) ? (1 + data[0]) * amp : height / 2
  ctx.moveTo(0, Math.max(0, Math.min(height, y)))

  for (let i = 1; i < frameLength; i++) {
    const x = i * scaleX
    y = Number.isFinite(data[i]) ? (1 + data[i]) * amp : height / 2
    ctx.lineTo(x, Math.max(0, Math.min(height, y)))
  }

  ctx.stroke()
}

document.addEventListener('DOMContentLoaded', init)
