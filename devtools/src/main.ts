import { type DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm'

const SCRIPT_PROCESSOR_BUFFER_SIZE = 1024
const INT16_MAX_VALUE = 0x7fff
const MIC_SCRIPT_PROCESSOR_BUFFER_SIZE = 512

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

// --- Microphone Input State ---
let micStream: MediaStream | null = null
let micSourceNode: MediaStreamAudioSourceNode | null = null
let micScriptProcessor: ScriptProcessorNode | null = null // For mic input processing
const micAccumulatedSamples = new Float32Array(MIC_SCRIPT_PROCESSOR_BUFFER_SIZE * 2) // 蓄積用バッファ
let micAccumulatedSamplesCount = 0 // 蓄積されたサンプル数

// New state for microphone input buffering when playing back
const processedMicFramesQueue: Float32Array[] = []
let currentPlaybackFrame: Float32Array | null = null
let currentPlaybackFrameReadIndex = 0

// UI Elements
let generateButton: HTMLButtonElement | null = null
let denoiseButton: HTMLButtonElement | null = null
let playbackButton: HTMLButtonElement | null = null
let noiseScaleSlider: HTMLInputElement | null = null
let noiseScaleValueSpan: HTMLSpanElement | null = null
let noiseAlphaSlider: HTMLInputElement | null = null
let noiseAlphaValueSpan: HTMLSpanElement | null = null
let autoNoiseRadioButton: HTMLInputElement | null = null
let micInputRadioButton: HTMLInputElement | null = null

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
  autoNoiseRadioButton = document.getElementById('autoNoise') as HTMLInputElement
  micInputRadioButton = document.getElementById('micInput') as HTMLInputElement

  if (
    !generateButton ||
    !denoiseButton ||
    !playbackButton ||
    !noiseScaleSlider ||
    !noiseScaleValueSpan ||
    !noiseAlphaSlider ||
    !noiseAlphaValueSpan ||
    !autoNoiseRadioButton ||
    !micInputRadioButton
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

  autoNoiseRadioButton.addEventListener('change', handleNoiseSourceChange)
  micInputRadioButton.addEventListener('change', handleNoiseSourceChange)

  updateButtonLabelsAndState()
}

function handleNoiseSourceChange() {
  if (isGenerating) {
    // If generation is active, stop and restart with the new source
    stopGenerating()
    // Short delay to allow resources to release if switching from mic
    setTimeout(() => {
      startGenerating()
      updateButtonLabelsAndState()
    }, 100)
  }
  updateButtonLabelsAndState() // Update UI elements based on selection
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
  // For mic input, playback is essentially just the processed output,
  // which is always active if denoising is on.
  // The concept of "playback" is more for auto-generated noise.
  if (micInputRadioButton?.checked) {
    console.log(
      '[togglePlayback] Playback control is not applicable for microphone input in this demo setup.',
    )
    // We can choose to disable the button or just log a message.
    // For now, let's allow toggling isPlaying for consistency,
    // even if its direct effect changes.
    // The actual audio output path will handle mic data.
  }

  isPlaying = !isPlaying
  if (isPlaying) {
    startAudioPlayback()
  } else {
    stopAudioPlayback()
  }
  updateButtonLabelsAndState()
}

async function startGenerating() {
  isGenerating = true
  lastNoiseValue = 0
  audioBufferReadIndex = frameSize // Reset read index for auto-generated noise buffer

  if (isDenoisingEnabled && !denoiseState) {
    createDenoiseState()
  }

  if (micInputRadioButton?.checked) {
    try {
      await startMicInput()
    } catch (error) {
      console.error('Failed to start microphone input:', error)
      alert('Could not start microphone. Please check permissions and console.')
      isGenerating = false
      // Ensure UI reflects that generation failed
      if (micInputRadioButton) micInputRadioButton.checked = false
      if (autoNoiseRadioButton) autoNoiseRadioButton.checked = true // Revert to auto
      updateButtonLabelsAndState()
      return
    }
  } else {
    // Stop mic input if it was active and now switching to auto-noise
    stopMicInput()
  }

  // Only start processLoop if not using mic input, as mic has its own audio processing chain
  if (autoNoiseRadioButton?.checked) {
    processLoop()
  } else if (micInputRadioButton?.checked && micSourceNode && audioContext) {
    // For mic input, the "processing" is tied to the micScriptProcessor's onaudioprocess
    // which directly feeds denoiseState if active.
    // We still need a loop for visualization.
    requestAnimationFrameId = requestAnimationFrame(visualizeMicInputLoop)
  }
}

function stopGenerating() {
  isGenerating = false
  if (isPlaying) {
    stopAudioPlayback() // Stops the playback ScriptProcessor
  }
  if (requestAnimationFrameId !== null) {
    cancelAnimationFrame(requestAnimationFrameId)
    requestAnimationFrameId = null
  }
  destroyDenoiseState()
  clearCanvas(originalCanvasCtx, originalCanvas)
  clearCanvas(processedCanvasCtx, processedCanvas)
  stopMicInput() // Ensure mic is stopped

  // Clear mic playback queue
  processedMicFramesQueue.length = 0
  currentPlaybackFrame = null
  currentPlaybackFrameReadIndex = 0
}

async function startMicInput() {
  if (micStream) {
    console.warn('[startMicInput] Microphone input already active.')
    return
  }

  if (!audioContext || audioContext.state === 'closed') {
    // latencyHint に 'interactive' を指定して低遅延を試みる
    // 数値を直接指定することも可能 (例: 0.01 for 10ms)
    audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    console.log('[startMicInput] AudioContext created/reopened. State:', audioContext.state)
  }
  if (audioContext.state === 'suspended') {
    await audioContext.resume()
    console.log('[startMicInput] AudioContext resumed. State:', audioContext.state)
  }

  if (audioContext.sampleRate !== 48000) {
    console.warn(
      `[startMicInput] AudioContext sample rate is ${audioContext.sampleRate}, not 48000. RNNoise might not work as expected.`,
    )
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        sampleRate: 48000, // Request 48kHz
        channelCount: 1,
        echoCancellation: false, // Recommended for RNNoise
        noiseSuppression: false, // Recommended for RNNoise
        autoGainControl: false, // Recommended for RNNoise
      },
      video: false,
    })
    console.log('[startMicInput] Microphone stream obtained.')
  } catch (err) {
    console.error('[startMicInput] Error getting microphone stream:', err)
    throw err // Re-throw to be caught by caller
  }

  micSourceNode = audioContext.createMediaStreamSource(micStream)

  // Setup a ScriptProcessorNode to get raw audio data from the mic
  // This will feed into audioBufferOriginal for visualization and processing
  micScriptProcessor = audioContext.createScriptProcessor(MIC_SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
  console.log(
    `[startMicInput] Mic ScriptProcessor created with buffer size: ${MIC_SCRIPT_PROCESSOR_BUFFER_SIZE}`,
  )
  micAccumulatedSamplesCount = 0 // 蓄積バッファをリセット

  micScriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!isGenerating || !micInputRadioButton?.checked || !rnnoise) return

    const inputData = event.inputBuffer.getChannelData(0) // 長さは MIC_SCRIPT_PROCESSOR_BUFFER_SIZE

    // 新しいデータを蓄積バッファに追加
    if (micAccumulatedSamplesCount + inputData.length > micAccumulatedSamples.length) {
      // バッファが溢れそうな場合は、古いデータから必要な分だけ残してシフト
      const spaceNeeded = inputData.length
      const keepFromEnd = Math.max(0, micAccumulatedSamplesCount - spaceNeeded - frameSize) // 念のためframeSizeのマージン
      const tempData = micAccumulatedSamples.slice(
        micAccumulatedSamplesCount - keepFromEnd,
        micAccumulatedSamplesCount,
      )
      micAccumulatedSamples.fill(0)
      micAccumulatedSamples.set(tempData, 0)
      micAccumulatedSamplesCount = tempData.length
      console.warn(
        '[MicProcess] Mic accumulation buffer nearly full, shifted data to prevent overflow.',
      )
    }
    micAccumulatedSamples.set(inputData, micAccumulatedSamplesCount)
    micAccumulatedSamplesCount += inputData.length

    // 処理可能なフレーム (frameSize) が蓄積バッファにある限りループ
    while (micAccumulatedSamplesCount >= frameSize) {
      // audioBufferOriginal に frameSize 分のデータをコピー
      audioBufferOriginal.set(micAccumulatedSamples.subarray(0, frameSize))

      // デノイズ処理
      if (isDenoisingEnabled && denoiseState) {
        const tempProcessingFrame = new Float32Array(frameSize)
        for (let i = 0; i < frameSize; i++) {
          tempProcessingFrame[i] = audioBufferOriginal[i] * INT16_MAX_VALUE
        }
        denoiseState.processFrame(tempProcessingFrame)
        for (let i = 0; i < frameSize; i++) {
          audioBufferProcessed[i] = Math.max(
            -1.0,
            Math.min(1.0, tempProcessingFrame[i] / INT16_MAX_VALUE),
          )
        }
      } else {
        audioBufferProcessed.set(audioBufferOriginal) // Or copy original if not denoising
      }

      // 再生が有効なら、処理済みフレームをキューに追加
      if (isPlaying) {
        // audioBufferProcessed にはデノイズ済み(またはオリジナル)データが入っている
        const frameToQueue = new Float32Array(frameSize)
        frameToQueue.set(audioBufferProcessed)
        processedMicFramesQueue.push(frameToQueue)
      }

      // 処理した分のデータを蓄積バッファから削除 (実際には残りのデータを先頭に移動)
      micAccumulatedSamples.copyWithin(0, frameSize, micAccumulatedSamplesCount)
      // 末尾の不要なデータをクリア (オプションだが、デバッグ時に役立つことも)
      // micAccumulatedSamples.fill(0, micAccumulatedSamplesCount - frameSize, micAccumulatedSamplesCount);
      micAccumulatedSamplesCount -= frameSize
    }
  }

  micSourceNode.connect(micScriptProcessor)
  micScriptProcessor.connect(audioContext.destination) // Connect to destination to keep it alive, but output will be silent.
  // Actually, we might not want to connect micScriptProcessor to destination if it's just for processing.
  // The playback scriptProcessor handles the actual output. Let's disconnect it from destination.
  micScriptProcessor.disconnect(audioContext.destination) // Correction: Don't send raw mic to output here.
  // The ScriptProcessorNode needs to be connected to *something* to keep the onaudioprocess event firing.
  // This is a requirement of the Web Audio API: a node remains active only as long as it is connected to an output.
  // However, we do not want the raw microphone input to be audible, so we cannot connect it directly to the destination.
  // Instead, we use a dummy GainNode with its gain set to 0. This ensures that the processor remains active
  // without producing any audible output. This is a common workaround when using ScriptProcessorNode.
  // Note: In modern implementations, AudioWorklets provide a more flexible and efficient way to handle such cases.
  // For now, this approach ensures compatibility and maintains the processor's activity for further processing.
  const dummyGain = audioContext.createGain()
  dummyGain.gain.value = 0
  micScriptProcessor.connect(dummyGain)
  dummyGain.connect(audioContext.destination)
  console.log('[startMicInput] Mic input chain configured.')
}

function stopMicInput() {
  if (micScriptProcessor) {
    micScriptProcessor.disconnect()
    micScriptProcessor.onaudioprocess = null
    micScriptProcessor = null
    console.log('[stopMicInput] Mic ScriptProcessor disconnected and cleared.')
  }
  micAccumulatedSamplesCount = 0 // 蓄積バッファのカウントをリセット
  if (micSourceNode) {
    micSourceNode.disconnect()
    micSourceNode = null
    console.log('[stopMicInput] Mic source node disconnected.')
  }
  if (micStream) {
    for (const track of micStream.getTracks()) {
      track.stop()
    }
    micStream = null
    console.log('[stopMicInput] Microphone stream stopped.')
  }
  // No need to close AudioContext here, it's shared
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
    // latencyHint に 'interactive' を指定して低遅延を試みる
    audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
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

  // For auto-generated noise, this reset is critical.
  // For mic input, audioBufferReadIndex is reset by the mic's onaudioprocess.
  if (autoNoiseRadioButton?.checked) {
    audioBufferReadIndex = frameSize
  } else if (micInputRadioButton?.checked) {
    processedMicFramesQueue.length = 0 // Clear the queue for mic input
    currentPlaybackFrame = null
    currentPlaybackFrameReadIndex = 0
  }
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
  const bufferSizeNode = outputBuffer.length // This is SCRIPT_PROCESSOR_BUFFER_SIZE

  if (autoNoiseRadioButton?.checked && rnnoise) {
    // Auto-generated noise path (existing logic)
    for (let i = 0; i < bufferSizeNode; i++) {
      if (audioBufferReadIndex >= frameSize) {
        generateAndProcessFrameForAutoNoise() // This resets audioBufferReadIndex for auto-noise
      }
      const sourceBuffer = isDenoisingEnabled ? audioBufferProcessed : audioBufferOriginal
      if (audioBufferReadIndex < sourceBuffer.length) {
        outputBuffer[i] = sourceBuffer[audioBufferReadIndex]
      } else {
        outputBuffer[i] = 0 // Safety for out-of-bounds
      }
      audioBufferReadIndex++
    }
  } else if (micInputRadioButton?.checked) {
    // Microphone input path (new logic using queue)
    for (let i = 0; i < bufferSizeNode; i++) {
      if (currentPlaybackFrame === null || currentPlaybackFrameReadIndex >= frameSize) {
        // Try to get a new frame from the queue
        if (processedMicFramesQueue.length > 0) {
          const shiftedFrame = processedMicFramesQueue.shift()
          if (shiftedFrame === undefined) {
            currentPlaybackFrame = null // Explicitly assign null if shift() result is undefined
            outputBuffer[i] = 0
            continue
          }
          // If shiftedFrame is not undefined, it can be assigned to currentPlaybackFrame
          currentPlaybackFrame = shiftedFrame
          currentPlaybackFrameReadIndex = 0
        } else {
          // Queue is empty, output silence for this sample
          currentPlaybackFrame = null
          outputBuffer[i] = 0
          continue
        }
      }

      if (currentPlaybackFrame) {
        outputBuffer[i] = currentPlaybackFrame[currentPlaybackFrameReadIndex]
        currentPlaybackFrameReadIndex++
      } else {
        outputBuffer[i] = 0
      }
    }
  } else {
    // Neither mode selected, or some other state - output silence
    for (let i = 0; i < bufferSizeNode; i++) {
      outputBuffer[i] = 0
    }
  }
}

// Renamed from generateAndProcessFrame to be specific to auto-noise mode
function generateAndProcessFrameForAutoNoise() {
  if (!rnnoise || !autoNoiseRadioButton?.checked) return

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
  // This loop is for auto-generated noise processing and visualization
  if (!isGenerating || !autoNoiseRadioButton?.checked) {
    if (requestAnimationFrameId !== null) {
      cancelAnimationFrame(requestAnimationFrameId)
      requestAnimationFrameId = null
    }
    return
  }

  generateAndProcessFrameForAutoNoise() // Use the renamed function

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

function visualizeMicInputLoop() {
  // This loop is for microphone input visualization
  if (!isGenerating || !micInputRadioButton?.checked) {
    if (requestAnimationFrameId !== null) {
      cancelAnimationFrame(requestAnimationFrameId)
      requestAnimationFrameId = null
    }
    return
  }

  // For mic input, audioBufferOriginal and audioBufferProcessed are updated
  // by micScriptProcessor.onaudioprocess. We just draw them here.
  if (originalCanvasCtx && originalCanvas) {
    drawWaveformFrame(originalCanvasCtx, originalCanvas, audioBufferOriginal, 'black')
  }
  if (processedCanvasCtx && processedCanvas) {
    const processedColor = isDenoisingEnabled ? 'blue' : 'red'
    drawWaveformFrame(processedCanvasCtx, processedCanvas, audioBufferProcessed, processedColor)
  }

  requestAnimationFrameId = requestAnimationFrame(visualizeMicInputLoop)
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
  if (
    !generateButton ||
    !denoiseButton ||
    !playbackButton ||
    !noiseScaleSlider ||
    !noiseAlphaSlider ||
    !autoNoiseRadioButton ||
    !micInputRadioButton
  )
    return

  generateButton.textContent = isGenerating ? 'Stop Audio Processing' : 'Start Audio Processing'

  const isMicMode = micInputRadioButton.checked === true

  denoiseButton.disabled = !isGenerating
  denoiseButton.textContent = isDenoisingEnabled ? 'Disable Denoise' : 'Enable Denoise'

  // Playback button logic might need adjustment for mic mode
  playbackButton.disabled = !isGenerating
  playbackButton.textContent = isPlaying ? 'Stop Playback' : 'Start Playback'

  // Disable noise type selection while generating
  autoNoiseRadioButton.disabled = isGenerating
  micInputRadioButton.disabled = isGenerating

  // Disable noise parameter sliders only if mic input is selected
  noiseScaleSlider.disabled = isMicMode
  noiseAlphaSlider.disabled = isMicMode
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
