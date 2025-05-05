import { type DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm'

// Define a type for the custom property on window
interface WindowWithLogFlag extends Window {
  loggedFrame?: { [key: string]: boolean }
}

// --- Constants ---
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096 // Needs to be power of 2: 256, 512, ..., 8192
const INT16_MAX_VALUE = 0x7fff // 32767
const NOISE_GENERATION_ALPHA = 0.1 // Smoothing factor for noise
const NOISE_GENERATION_SCALE = 0.2 // Amplitude scale for white noise
// const AUDIO_WORKLET_PROCESSOR_NAME = 'rnnoise-processor' // Removed

// --- State Variables ---
let isGenerating = false
let isDenoisingEnabled = false
let isPlaying = false
let audioContext: AudioContext | null = null
let rnnoise: Rnnoise | null = null
let denoiseState: DenoiseState | null = null
let scriptProcessor: ScriptProcessorNode | null = null // Use ScriptProcessorNode again
// let audioWorkletNode: AudioWorkletNode | null = null // Removed
let requestAnimationFrameId: number | null = null
let originalCanvasCtx: CanvasRenderingContext2D | null = null
let processedCanvasCtx: CanvasRenderingContext2D | null = null
let originalCanvas: HTMLCanvasElement | null = null
let processedCanvas: HTMLCanvasElement | null = null
let frameSize = 480 // Default, will be updated after loading rnnoise
let lastNoiseValue = 0

// Buffers
let audioBufferOriginal = new Float32Array(frameSize)
let audioBufferProcessed = new Float32Array(frameSize)
let audioBufferReadIndex = frameSize // Reintroduce read index

// Button elements
let generateButton: HTMLButtonElement | null = null
let denoiseButton: HTMLButtonElement | null = null
let playbackButton: HTMLButtonElement | null = null

// --- Initialization ---
async function init() {
  console.log('Initializing...')
  originalCanvas = document.getElementById('original-waveform') as HTMLCanvasElement
  processedCanvas = document.getElementById('processed-waveform') as HTMLCanvasElement
  if (originalCanvas) {
    originalCanvasCtx = originalCanvas.getContext('2d')
  }
  if (processedCanvas) {
    processedCanvasCtx = processedCanvas.getContext('2d')
  }

  // Get Buttons
  generateButton = document.getElementById('toggleGenerateButton') as HTMLButtonElement
  denoiseButton = document.getElementById('toggleDenoiseButton') as HTMLButtonElement
  playbackButton = document.getElementById('togglePlaybackButton') as HTMLButtonElement

  if (!generateButton || !denoiseButton || !playbackButton) {
    console.error('Control buttons not found!')
    alert('Initialization failed: Control buttons missing.')
    return
  }

  console.log('Loading RNNoise WASM...')
  try {
    rnnoise = await Rnnoise.load()
    frameSize = rnnoise.frameSize
    // Recreate buffers with the actual frameSize
    audioBufferOriginal = new Float32Array(frameSize)
    audioBufferProcessed = new Float32Array(frameSize)
    audioBufferReadIndex = frameSize
    console.log(`RNNoise WASM loaded. Frame size: ${frameSize}`)
  } catch (error) {
    console.error('Failed to load RNNoise WASM:', error)
    alert('Failed to load RNNoise WASM. Check console.')
    generateButton.disabled = true
    denoiseButton.disabled = true
    playbackButton.disabled = true
    return
  }

  // Setup button listeners
  generateButton.addEventListener('click', toggleGeneration)
  denoiseButton.addEventListener('click', toggleDenoising)
  playbackButton.addEventListener('click', togglePlayback)

  // Remove AudioWorklet support check
  // if (!(window.AudioContext && 'audioWorklet' in window.AudioContext.prototype)) {
  //   console.error('AudioWorklet is not supported in this browser.')
  //   alert('AudioWorklet is not supported. Playback will be disabled.')
  //   playbackButton.disabled = true
  // } else {
  //   console.log('AudioWorklet is supported.')
  // }

  console.log('Initialization complete.')
  updateButtonLabelsAndState()
}

// --- Toggle Functions ---
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
  // Remove worklet update message
  // if (this.isPlaying && this.audioWorkletNode) {
  //     this.audioWorkletNode.port.postMessage({
  //         type: 'SET_DENOISE_STATUS',
  //         isDenoisingEnabled: this.isDenoisingEnabled
  //     });
  // }
  updateButtonLabelsAndState()
}

function togglePlayback() {
  if (!isGenerating) return
  isPlaying = !isPlaying
  if (isPlaying) {
    startAudioPlayback()
  } else {
    stopAudioPlayback()
  }
  updateButtonLabelsAndState()
}

// --- Core Logic Start/Stop ---
function startGenerating() {
  console.log('Starting generation & visualization...')
  isGenerating = true
  lastNoiseValue = 0
  audioBufferReadIndex = frameSize // Reset read index

  // Create denoise state immediately if it was enabled before stopping
  if (isDenoisingEnabled && !denoiseState) {
    createDenoiseState()
  }

  processLoop() // Start RAF loop
}

function stopGenerating() {
  console.log('Stopping generation & visualization...')
  isGenerating = false
  if (isPlaying) {
    stopAudioPlayback() // Stop playback if generation stops
  }
  if (requestAnimationFrameId !== null) {
    cancelAnimationFrame(requestAnimationFrameId)
    requestAnimationFrameId = null
  }
  destroyDenoiseState() // Always destroy when stopping generation
  clearCanvas(originalCanvasCtx, originalCanvas)
  clearCanvas(processedCanvasCtx, processedCanvas)
}

function startAudioPlayback() {
  // No longer async
  if (!isGenerating || !rnnoise) {
    console.error('Cannot start playback: Not generating or RNNoise not loaded.')
    isPlaying = false
    return
  }
  // Remove AudioWorklet support check
  // if (!window.AudioContext || !window.AudioContext.prototype.hasOwnProperty('audioWorklet')) {
  //   console.error('AudioWorklet not supported, cannot start playback.')
  //   isPlaying = false
  //   return
  // }
  console.log('Starting audio playback...')
  isPlaying = true

  // Init AudioContext
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext({ sampleRate: 48000 })
    console.log('AudioContext created.')
    // Remove module loading
    // try {
    //   await this.audioContext.audioWorklet.addModule('rnnoise-processor.js')
    //   console.log('AudioWorklet module loaded.')
    // } catch (e) {
    //   console.error('Failed to load AudioWorklet module:', e)
    //   alert('Failed to load AudioWorklet module. Playback disabled.')
    //   this.isPlaying = false
    //   if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close()
    //   this.audioContext = null
    //   return
    // }
  }
  if (audioContext.state === 'suspended') {
    // No longer need await
    audioContext.resume().then(() => console.log('AudioContext resumed.'))
  }

  // Setup ScriptProcessorNode again
  if (audioContext.sampleRate !== 48000) {
    console.warn(
      `AudioContext sample rate is ${audioContext.sampleRate}, not 48000. RNNoise might not work as expected.`,
    )
  }

  // this.audioWorkletNode = new AudioWorkletNode(this.audioContext, AUDIO_WORKLET_PROCESSOR_NAME)
  // this.audioWorkletNode.port.onmessage = this.handleWorkletMessage.bind(this) // Bind 'this'
  //
  // // Send initial state immediately (processor might be ready)
  // this.audioWorkletNode.port.postMessage({
  //     type: 'SET_DENOISE_STATUS',
  //     isDenoisingEnabled: this.isDenoisingEnabled
  // });
  //
  // this.audioWorkletNode.connect(this.audioContext.destination)
  // console.log('AudioWorkletNode connected for playback.')

  scriptProcessor = audioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1) // 1 input, 1 output
  scriptProcessor.onaudioprocess = handleAudioProcess // Attach the handler
  scriptProcessor.connect(audioContext.destination)
  console.log('ScriptProcessorNode connected for playback.')

  // Reset audio buffer read index to ensure fresh data is pulled
  audioBufferReadIndex = frameSize
}

function stopAudioPlayback() {
  console.log('Stopping audio playback...')
  isPlaying = false

  // Stop ScriptProcessor
  if (scriptProcessor) {
    scriptProcessor.disconnect()
    scriptProcessor.onaudioprocess = null
    scriptProcessor = null
    console.log('ScriptProcessorNode disconnected.')
  }

  // Remove worklet stop logic
  // if (this.audioWorkletNode) {
  //   this.audioWorkletNode.port.onmessage = null
  //   this.audioWorkletNode.disconnect()
  //   this.audioWorkletNode = null
  //   console.log('AudioWorkletNode disconnected.')
  // }
  // Optional: Close context
  // if (audioContext && audioContext.state !== 'closed') {
  //   audioContext.close().then(() => console.log('AudioContext closed.'));
  //   audioContext = null;
  // }
}

// Reintroduce handleAudioProcess
function handleAudioProcess(event: AudioProcessingEvent) {
  if (!isPlaying || !scriptProcessor) return

  const outputBuffer = event.outputBuffer.getChannelData(0)
  const bufferSizeNode = outputBuffer.length

  for (let i = 0; i < bufferSizeNode; i++) {
    if (audioBufferReadIndex >= frameSize) {
      // Buffer empty, generate a new frame
      generateAndProcessFrame() // Generates into shared buffers

      if (audioBufferReadIndex >= frameSize) {
        console.warn('Audio buffer starved even after generate call at index', i)
        outputBuffer[i] = 0 // Output silence
        continue
      }
    }

    // Select buffer based on current denoise state
    const sourceBuffer = isDenoisingEnabled ? audioBufferProcessed : audioBufferOriginal
    outputBuffer[i] = sourceBuffer[audioBufferReadIndex]
    audioBufferReadIndex++
  }
}

// Remove handleWorkletMessage
// private handleWorkletMessage(event: MessageEvent) {
//     if (event.data.type === 'REQUEST_FRAME') {
//         if (!this.isGenerating) return; // Don't generate if stopped
//
//         this.generateAndProcessFrame(); // Generate a new frame
//
//         // Send the appropriate buffer to the worklet
//         const bufferToSend = this.isDenoisingEnabled ? this.audioBufferProcessed : this.audioBufferOriginal;
//
//         // Send the Float32Array directly. It will be copied.
//         this.audioWorkletNode?.port.postMessage({
//             type: 'FRAME_DATA',
//             audioData: bufferToSend
//         }, [bufferToSend.buffer]); // Transferable
//
//     } else if (event.data.type === 'PROCESSOR_READY') {
//        console.log('AudioWorklet processor reported ready.');
//        // Send state again when processor confirms it's ready
//        this.audioWorkletNode?.port.postMessage({
//          type: 'SET_DENOISE_STATUS',
//          isDenoisingEnabled: this.isDenoisingEnabled,
//        })
//     }
// }

// --- Frame Generation & Processing ---
function generateAndProcessFrame() {
  if (!rnnoise) return

  // 1. Generate smoother noise
  for (let i = 0; i < frameSize; i++) {
    const whiteNoise = (Math.random() * 2 - 1) * NOISE_GENERATION_SCALE
    audioBufferOriginal[i] =
      NOISE_GENERATION_ALPHA * whiteNoise + (1 - NOISE_GENERATION_ALPHA) * lastNoiseValue
    lastNoiseValue = audioBufferOriginal[i]
  }

  // 2. Process with RNNoise if enabled
  if (isDenoisingEnabled && denoiseState) {
    // Create a temporary buffer for processing (in-place modification by rnnoise)
    const tempProcessingFrame = new Float32Array(audioBufferOriginal)
    for (let i = 0; i < frameSize; i++) {
      tempProcessingFrame[i] *= INT16_MAX_VALUE // Scale to int16 range
    }
    denoiseState.processFrame(tempProcessingFrame) // Process in-place

    // Copy processed data back, scaling down and clamping
    for (let i = 0; i < frameSize; i++) {
      audioBufferProcessed[i] = Math.max(
        -1.0,
        Math.min(1.0, tempProcessingFrame[i] / INT16_MAX_VALUE),
      )
    }
  } else {
    // If denoising is off, copy original to processed buffer
    for (let i = 0; i < frameSize; ++i) {
      audioBufferProcessed[i] = audioBufferOriginal[i]
    }
    // this.audioBufferProcessed.set(this.audioBufferOriginal);
  }
  // Reset read index after generating a frame
  audioBufferReadIndex = 0
}

// --- RAF Loop (Visualization) ---
function processLoop() {
  if (!isGenerating) return

  // Generate frame data primarily for visualization.
  // If audio is playing, handleAudioProcess also calls this.
  // Calling it here ensures visualization updates even if audio isn't playing.
  generateAndProcessFrame()

  // Draw waveforms
  if (originalCanvasCtx && originalCanvas) {
    drawWaveformFrame(originalCanvasCtx, originalCanvas, audioBufferOriginal)
  }
  if (processedCanvasCtx && processedCanvas) {
    drawWaveformFrame(processedCanvasCtx, processedCanvas, audioBufferProcessed)
  }

  // Request next frame
  requestAnimationFrameId = requestAnimationFrame(processLoop)
}

// --- Utility Functions ---
function createDenoiseState() {
  if (!denoiseState && rnnoise) {
    denoiseState = rnnoise.createDenoiseState()
    console.log('Denoise state created.')
  } else if (denoiseState) {
    console.warn('Attempted to create DenoiseState when it already exists.')
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

  // Update playback button state (remove worklet check)
  playbackButton.disabled = !isGenerating
  playbackButton.textContent = isPlaying ? 'Stop Playback' : 'Start Playback'
}

// --- Drawing Function ---
function drawWaveformFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  data: Float32Array,
) {
  const width = canvas.width
  const height = canvas.height
  const amp = height / 2
  const frameLength = data.length

  ctx.fillStyle = 'white'
  ctx.fillRect(0, 0, width, height)
  ctx.strokeStyle = 'black'
  ctx.lineWidth = 1
  ctx.beginPath()

  const scaleX = width / frameLength
  let y = (1 + data[0]) * amp
  ctx.moveTo(0, Math.max(0, Math.min(height, y))) // Clamp y to canvas bounds

  for (let i = 1; i < frameLength; i++) {
    const x = i * scaleX
    y = (1 + data[i]) * amp
    ctx.lineTo(x, Math.max(0, Math.min(height, y))) // Clamp y
  }

  ctx.stroke()
}

// --- Start on Load ---
// Remove class instantiation
// const app = new AudioDemoApp()
document.addEventListener('DOMContentLoaded', init)
