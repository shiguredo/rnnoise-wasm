import { type DenoiseState, Rnnoise } from '@shiguredo/rnnoise-wasm'

const SCRIPT_PROCESSOR_BUFFER_SIZE = 1024
const INT16_MAX_VALUE = 0x7fff
const MIC_SCRIPT_PROCESSOR_BUFFER_SIZE = 2048

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
let echoCancellationCheckbox: HTMLInputElement | null = null
let noiseSuppressionCheckbox: HTMLInputElement | null = null
let autoGainControlCheckbox: HTMLInputElement | null = null
let micSelectElement: HTMLSelectElement | null = null // Added for microphone selection
let requestMicPermissionButton: HTMLButtonElement | null = null // Added for requesting mic permission
let availableMicDevices: MediaDeviceInfo[] = [] // To store available mic devices
let micPermissionGranted = false // To track microphone permission status

// Speaker Output State
let speakerSelectElement: HTMLSelectElement | null = null
let outputAudioElement: HTMLAudioElement | null = null
let mediaStreamDestination: MediaStreamAudioDestinationNode | null = null
let availableSpeakerDevices: MediaDeviceInfo[] = []
const isSetSinkIdSupported = 'setSinkId' in HTMLMediaElement.prototype

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
  micSelectElement = document.getElementById('micSelect') as HTMLSelectElement // Get mic select element
  requestMicPermissionButton = document.getElementById(
    'requestMicPermissionButton',
  ) as HTMLButtonElement
  speakerSelectElement = document.getElementById('speakerSelect') as HTMLSelectElement
  outputAudioElement = document.getElementById('outputAudioElement') as HTMLAudioElement

  echoCancellationCheckbox = document.getElementById('echoCancellationCheckbox') as HTMLInputElement
  noiseSuppressionCheckbox = document.getElementById('noiseSuppressionCheckbox') as HTMLInputElement
  autoGainControlCheckbox = document.getElementById('autoGainControlCheckbox') as HTMLInputElement

  if (
    !generateButton ||
    !denoiseButton ||
    !playbackButton ||
    !noiseScaleSlider ||
    !noiseScaleValueSpan ||
    !noiseAlphaSlider ||
    !noiseAlphaValueSpan ||
    !autoNoiseRadioButton ||
    !micInputRadioButton ||
    !echoCancellationCheckbox ||
    !noiseSuppressionCheckbox ||
    !autoGainControlCheckbox ||
    !micSelectElement ||
    !requestMicPermissionButton ||
    !speakerSelectElement ||
    !outputAudioElement
  ) {
    console.error('Control elements not found!')
    alert('Initialization failed: Control elements missing.')
    if (generateButton) generateButton.disabled = true
    if (denoiseButton) denoiseButton.disabled = true
    if (playbackButton) playbackButton.disabled = true
    if (noiseScaleSlider) noiseScaleSlider.disabled = true
    if (noiseAlphaSlider) noiseAlphaSlider.disabled = true
    if (micSelectElement) micSelectElement.disabled = true
    if (requestMicPermissionButton) requestMicPermissionButton.disabled = true
    if (speakerSelectElement) speakerSelectElement.disabled = true
    return
  }

  // Add this check for setSinkId support
  if (!isSetSinkIdSupported) {
    console.warn(
      'HTMLMediaElement.setSinkId() is not supported in this browser. Speaker selection will be disabled.',
    )
    if (speakerSelectElement) {
      speakerSelectElement.disabled = true
      const option = document.createElement('option')
      option.textContent = 'Speaker selection not supported'
      speakerSelectElement.appendChild(option)
    }
  }

  // デフォルト値を設定
  echoCancellationCheckbox.checked = false // デフォルト無効
  noiseSuppressionCheckbox.checked = false // デフォルト無効
  autoGainControlCheckbox.checked = false // デフォルト無効

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
    if (micSelectElement) micSelectElement.disabled = true
    if (requestMicPermissionButton) requestMicPermissionButton.disabled = true
    if (speakerSelectElement) speakerSelectElement.disabled = true
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
  micSelectElement.addEventListener('change', handleMicDeviceChange)
  requestMicPermissionButton.addEventListener('click', requestMicrophonePermission)
  if (isSetSinkIdSupported && speakerSelectElement) {
    speakerSelectElement.addEventListener('change', handleSpeakerDeviceChange)
  }

  // デフォルトの入力ソースをマイク入力に設定
  micInputRadioButton.checked = true
  autoNoiseRadioButton.checked = false

  updateButtonLabelsAndState()
}

async function populateMicrophoneList() {
  if (!micSelectElement || !micPermissionGranted) {
    if (micSelectElement) micSelectElement.disabled = true
    return
  }

  const previouslySelectedDeviceId = micSelectElement.value
  micSelectElement.innerHTML = '' // Clear existing options

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    availableMicDevices = devices.filter((device) => device.kind === 'audioinput')

    if (availableMicDevices.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No microphones found'
      micSelectElement.appendChild(option)
      micSelectElement.disabled = true
      return
    }

    for (const device of availableMicDevices) {
      const option = document.createElement('option')
      option.value = device.deviceId
      option.textContent = device.label || `Microphone ${micSelectElement.options.length + 1}`
      micSelectElement.appendChild(option)
    }

    // Try to restore previously selected device
    if (
      previouslySelectedDeviceId &&
      micSelectElement.querySelector(`option[value="${previouslySelectedDeviceId}"]`)
    ) {
      micSelectElement.value = previouslySelectedDeviceId
    }

    micSelectElement.disabled = false
  } catch (err) {
    console.error('Error populating microphone list:', err)
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'Error listing microphones'
    micSelectElement.appendChild(option)
    micSelectElement.disabled = true
    availableMicDevices = [] // Clear on error
  }
}

function handleMicDeviceChange() {
  if (isGenerating && micInputRadioButton?.checked) {
    console.log('Microphone selection changed. Restarting audio processing...')
    // Stop the current audio processing.
    // This will also stop the current mic input.
    stopGenerating()

    // Short delay to allow resources to release properly
    setTimeout(() => {
      // Restart audio processing. startGenerating will call startMicInput,
      // which will now use the newly selected device from micSelectElement.
      startGenerating()
      updateButtonLabelsAndState() // Ensure UI is consistent
    }, 150) // Slightly increased delay
  }
}

function handleNoiseSourceChange() {
  if (isGenerating) {
    stopGenerating()
    setTimeout(() => {
      startGenerating()
      updateButtonLabelsAndState()
    }, 100)
  }
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
  if (micInputRadioButton?.checked) {
    console.log(
      '[togglePlayback] Playback control is not applicable for microphone input in this demo setup.',
    )
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
  audioBufferReadIndex = frameSize

  if (isDenoisingEnabled && !denoiseState) {
    createDenoiseState()
  }

  if (micInputRadioButton?.checked) {
    try {
      await startMicInput() // This will now use the selected mic and populate the list
    } catch (error) {
      console.error('Failed to start microphone input:', error)
      alert('Could not start microphone. Please check permissions and console.')
      isGenerating = false
      if (micInputRadioButton) micInputRadioButton.checked = false
      if (autoNoiseRadioButton) autoNoiseRadioButton.checked = true
      updateButtonLabelsAndState()
      return
    }
  } else {
    stopMicInput()
  }

  if (autoNoiseRadioButton?.checked) {
    processLoop()
  } else if (micInputRadioButton?.checked && micSourceNode && audioContext) {
    requestAnimationFrameId = requestAnimationFrame(visualizeMicInputLoop)
  }
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
  stopMicInput() // This will stop the current mic stream

  processedMicFramesQueue.length = 0
  currentPlaybackFrame = null
  currentPlaybackFrameReadIndex = 0
}

async function startMicInput() {
  if (!micPermissionGranted) {
    console.warn('[startMicInput] Microphone permission not granted.')
    alert('Please grant microphone permission first by clicking "Load Microphones".')
    // Attempt to stop generation if it was somehow started
    isGenerating = false
    updateButtonLabelsAndState()
    throw new Error('Microphone permission not granted.')
  }
  if (micSelectElement && micSelectElement.value === '' && availableMicDevices.length > 0) {
    console.warn('[startMicInput] No microphone selected.')
    alert('Please select a microphone from the list.')
    isGenerating = false
    updateButtonLabelsAndState()
    throw new Error('No microphone selected.')
  }
  if (availableMicDevices.length === 0 && micPermissionGranted) {
    console.warn('[startMicInput] No microphones available, though permission was granted.')
    alert('No microphones found. Please connect a microphone and click "Load Microphones" again.')
    isGenerating = false
    updateButtonLabelsAndState()
    throw new Error('No microphones available.')
  }

  if (micStream) {
    console.warn(
      '[startMicInput] Microphone input attempt while stream already active. Stopping old one.',
    )
    // Ensure the old stream is properly stopped before starting a new one.
    // This can happen if startMicInput is called without a full stopGenerating cycle.
    const tempTracks = micStream.getTracks()
    for (const track of tempTracks) {
      track.stop()
    }
    micStream = null
    if (micSourceNode) {
      micSourceNode.disconnect()
      micSourceNode = null
    }
    if (micScriptProcessor) {
      micScriptProcessor.disconnect()
      micScriptProcessor = null
    }
  }

  // Populate/update microphone list each time mic input is started
  // This handles cases like granting permission after page load or plugging in a new mic.
  // await populateMicrophoneList() // This is now called after permission grant
  if (micSelectElement) {
    // micSelectElement.disabled = availableMicDevices.length === 0 || !isGenerating
    // Disability is handled by requestPermission and updateButtonLabelsAndState
  }

  if (!audioContext || audioContext.state === 'closed') {
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

  const selectedDeviceId = micSelectElement?.value
  const constraints: MediaStreamConstraints = {
    audio: {
      sampleRate: 48000,
      channelCount: 1,
      echoCancellation: echoCancellationCheckbox?.checked ?? false,
      noiseSuppression: noiseSuppressionCheckbox?.checked ?? false,
      autoGainControl: autoGainControlCheckbox?.checked ?? false,
    },
    video: false,
  }

  if (
    selectedDeviceId &&
    availableMicDevices.find((d) => d.deviceId === selectedDeviceId) &&
    constraints.audio &&
    typeof constraints.audio === 'object'
  ) {
    constraints.audio.deviceId = { exact: selectedDeviceId }
    console.log(`[startMicInput] Attempting to use microphone: ID=${selectedDeviceId}`)
  } else {
    console.log(
      '[startMicInput] No specific microphone selected, or selected device not found. Using default.',
    )
    // If a device was selected but not found in availableMicDevices (e.g., unplugged),
    // we should clear the deviceId constraint to use the system default.
    if (constraints.audio && typeof constraints.audio === 'object') {
      // Ensure that constraints.audio is treated as an object that can have deviceId
      const audioSettings = constraints.audio as MediaTrackConstraints
      audioSettings.deviceId = undefined
    }
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia(constraints)
    console.log('[startMicInput] Microphone stream obtained.')
    // If list was empty and now we have a stream, re-populate to get labels.
    // This handles the case where labels are only available after the first successful getUserMedia.
    const currentLabelsExist = availableMicDevices.some((d) => d.label && d.label !== '')
    if (
      micSelectElement &&
      (!currentLabelsExist || availableMicDevices.length === 0) &&
      micStream
    ) {
      console.log(
        '[startMicInput] Repopulating mic list to get device labels after stream obtained.',
      )
      await populateMicrophoneList() // Re-populate to get labels
      // Ensure the selection made by getUserMedia (if it picked a default) or the previous selection is reflected
      const activeTrack = micStream.getAudioTracks()[0]
      if (activeTrack) {
        const activeDeviceId = activeTrack.getSettings().deviceId
        if (activeDeviceId && micSelectElement.querySelector(`option[value="${activeDeviceId}"]`)) {
          micSelectElement.value = activeDeviceId
        } else if (
          selectedDeviceId &&
          micSelectElement.querySelector(`option[value="${selectedDeviceId}"]`)
        ) {
          // fallback to original selection if active one is not in list (should not happen often)
          micSelectElement.value = selectedDeviceId
        }
      }
    }
  } catch (err) {
    console.error('[startMicInput] Error getting microphone stream:', err)
    if (micSelectElement) micSelectElement.disabled = true
    availableMicDevices = [] // Clear devices on error
    throw err // Re-throw to be caught by caller in startGenerating
  }

  micSourceNode = audioContext.createMediaStreamSource(micStream)
  micScriptProcessor = audioContext.createScriptProcessor(MIC_SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
  console.log(
    `[startMicInput] Mic ScriptProcessor created with buffer size: ${MIC_SCRIPT_PROCESSOR_BUFFER_SIZE}`,
  )
  micAccumulatedSamplesCount = 0

  micScriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
    if (!isGenerating || !micInputRadioButton?.checked || !rnnoise) return

    const inputData = event.inputBuffer.getChannelData(0)

    if (micAccumulatedSamplesCount + inputData.length > micAccumulatedSamples.length) {
      const spaceNeeded = inputData.length
      const keepFromEnd = Math.max(0, micAccumulatedSamplesCount - spaceNeeded - frameSize)
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

    while (micAccumulatedSamplesCount >= frameSize) {
      audioBufferOriginal.set(micAccumulatedSamples.subarray(0, frameSize))

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
        audioBufferProcessed.set(audioBufferOriginal)
      }

      if (isPlaying) {
        const frameToQueue = new Float32Array(frameSize)
        frameToQueue.set(audioBufferProcessed)
        processedMicFramesQueue.push(frameToQueue)
      }

      micAccumulatedSamples.copyWithin(0, frameSize, micAccumulatedSamplesCount)
      micAccumulatedSamplesCount -= frameSize
    }
  }

  micSourceNode.connect(micScriptProcessor)
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
  micAccumulatedSamplesCount = 0
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
  // availableMicDevices = [] // Clear available devices when mic input stops
  // Don't disable micSelectElement here, let updateButtonLabelsAndState handle it
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
    audioContext = new AudioContext({ sampleRate: 48000, latencyHint: 'interactive' })
    console.log('[startAudioPlayback] AudioContext created. State:', audioContext.state)
    // Create the MediaStreamDestinationNode when AudioContext is created
    if (isSetSinkIdSupported && audioContext && !mediaStreamDestination) {
      mediaStreamDestination = audioContext.createMediaStreamDestination()
      if (outputAudioElement) {
        outputAudioElement.srcObject = mediaStreamDestination.stream
        console.log('Output audio element connected to MediaStreamDestination.')
      }
    }
  }
  if (audioContext.state === 'suspended') {
    audioContext
      .resume()
      .then(() =>
        console.log('[startAudioPlayback] AudioContext resumed. State:', audioContext?.state),
      )
      .catch((err) => console.error('[startAudioPlayback] Failed to resume AudioContext:', err))
  }

  // Ensure MediaStreamDestination is ready before connecting to it
  if (isSetSinkIdSupported && !mediaStreamDestination && audioContext) {
    mediaStreamDestination = audioContext.createMediaStreamDestination()
    if (outputAudioElement) {
      outputAudioElement.srcObject = mediaStreamDestination.stream
      console.log('Output audio element re-connected to MediaStreamDestination (playback start).')
    }
  }

  if (audioContext.sampleRate !== 48000) {
    console.warn(
      `AudioContext sample rate is ${audioContext.sampleRate}, not 48000. RNNoise might not work as expected.`,
    )
  }

  scriptProcessor = audioContext.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1)
  scriptProcessor.onaudioprocess = handleAudioProcess
  // Connect to mediaStreamDestination if supported, otherwise fallback to default destination
  if (isSetSinkIdSupported && mediaStreamDestination) {
    scriptProcessor.connect(mediaStreamDestination)
    console.log(
      '[startAudioPlayback] ScriptProcessorNode connected to MediaStreamDestination for playback.',
    )
  } else {
    scriptProcessor.connect(audioContext.destination) // Fallback
    console.log(
      '[startAudioPlayback] ScriptProcessorNode connected to default AudioContext destination.',
    )
  }

  if (autoNoiseRadioButton?.checked) {
    audioBufferReadIndex = frameSize
  } else if (micInputRadioButton?.checked) {
    processedMicFramesQueue.length = 0
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
  // Optionally, when stopping playback, clear the srcObject of the audio element
  // to free up resources, if no other audio is expected to play through it.
  // However, if AudioContext might still be used for other purposes that eventually
  // route to mediaStreamDestination, keep it connected.
  // For this demo, stopping playback implies all app-generated sound stops.
  if (outputAudioElement && isSetSinkIdSupported) {
    // outputAudioElement.srcObject = null; // This might be too aggressive if context is reused.
    // outputAudioElement.pause(); // More gentle stop.
  }
}

function handleAudioProcess(event: AudioProcessingEvent) {
  if (!isPlaying || !scriptProcessor) return

  const outputBuffer = event.outputBuffer.getChannelData(0)
  const bufferSizeNode = outputBuffer.length

  if (autoNoiseRadioButton?.checked && rnnoise) {
    for (let i = 0; i < bufferSizeNode; i++) {
      if (audioBufferReadIndex >= frameSize) {
        generateAndProcessFrameForAutoNoise()
      }
      const sourceBuffer = isDenoisingEnabled ? audioBufferProcessed : audioBufferOriginal
      if (audioBufferReadIndex < sourceBuffer.length) {
        outputBuffer[i] = sourceBuffer[audioBufferReadIndex]
      } else {
        outputBuffer[i] = 0
      }
      audioBufferReadIndex++
    }
  } else if (micInputRadioButton?.checked) {
    for (let i = 0; i < bufferSizeNode; i++) {
      if (currentPlaybackFrame === null || currentPlaybackFrameReadIndex >= frameSize) {
        if (processedMicFramesQueue.length > 0) {
          const shiftedFrame = processedMicFramesQueue.shift()
          if (shiftedFrame === undefined) {
            currentPlaybackFrame = null
            outputBuffer[i] = 0
            continue
          }
          currentPlaybackFrame = shiftedFrame
          currentPlaybackFrameReadIndex = 0
        } else {
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
    for (let i = 0; i < bufferSizeNode; i++) {
      outputBuffer[i] = 0
    }
  }
}

function generateAndProcessFrameForAutoNoise() {
  if (!rnnoise || !autoNoiseRadioButton?.checked) return

  for (let i = 0; i < frameSize; i++) {
    const whiteNoise = (Math.random() * 2 - 1) * noiseGenerationScale
    audioBufferOriginal[i] =
      noiseGenerationAlpha * whiteNoise + (1 - noiseGenerationAlpha) * lastNoiseValue
    lastNoiseValue = audioBufferOriginal[i]
  }

  if (isDenoisingEnabled && denoiseState) {
    const tempProcessingFrame = new Float32Array(audioBufferOriginal)
    for (let i = 0; i < frameSize; i++) {
      tempProcessingFrame[i] *= INT16_MAX_VALUE
    }
    denoiseState.processFrame(tempProcessingFrame)

    for (let i = 0; i < frameSize; i++) {
      audioBufferProcessed[i] = Math.max(
        -1.0,
        Math.min(1.0, tempProcessingFrame[i] / INT16_MAX_VALUE),
      )
    }
  } else {
    audioBufferProcessed.set(audioBufferOriginal)
  }
  audioBufferReadIndex = 0
}

function processLoop() {
  if (!isGenerating || !autoNoiseRadioButton?.checked) {
    if (requestAnimationFrameId !== null) {
      cancelAnimationFrame(requestAnimationFrameId)
      requestAnimationFrameId = null
    }
    return
  }

  generateAndProcessFrameForAutoNoise()

  if (originalCanvasCtx && originalCanvas) {
    drawWaveformFrame(originalCanvasCtx, originalCanvas, audioBufferOriginal, 'black')
  }
  if (processedCanvasCtx && processedCanvas) {
    const processedColor = isDenoisingEnabled ? 'blue' : 'red'
    drawWaveformFrame(processedCanvasCtx, processedCanvas, audioBufferProcessed, processedColor)
  }

  requestAnimationFrameId = requestAnimationFrame(processLoop)
}

function visualizeMicInputLoop() {
  if (!isGenerating || !micInputRadioButton?.checked) {
    if (requestAnimationFrameId !== null) {
      cancelAnimationFrame(requestAnimationFrameId)
      requestAnimationFrameId = null
    }
    return
  }

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
    !micInputRadioButton ||
    !echoCancellationCheckbox ||
    !noiseSuppressionCheckbox ||
    !autoGainControlCheckbox ||
    !micSelectElement ||
    !requestMicPermissionButton ||
    !speakerSelectElement ||
    !outputAudioElement
  )
    return

  const isMicMode = micInputRadioButton.checked === true

  // Request Mic Permission Button
  if (isMicMode) {
    requestMicPermissionButton.disabled = micPermissionGranted || isGenerating
    if (micPermissionGranted) {
      requestMicPermissionButton.textContent = 'Microphones Loaded'
    } else {
      requestMicPermissionButton.textContent = isGenerating
        ? 'Processing... (Cannot Load Mics)'
        : 'Load Microphones'
    }
  } else {
    requestMicPermissionButton.disabled = true // Disable if not in mic mode
    requestMicPermissionButton.textContent = 'Load Microphones' // Reset text
  }

  // Generate Button State
  if (isMicMode) {
    generateButton.disabled =
      !micPermissionGranted ||
      availableMicDevices.length === 0 ||
      (micSelectElement.value === '' && availableMicDevices.length > 0) ||
      rnnoise === null
    if (isGenerating) generateButton.disabled = false // If already generating, it should be enabled to stop
  } else {
    // Auto-noise mode: enable if rnnoise is loaded
    generateButton.disabled = rnnoise === null
  }
  generateButton.textContent = isGenerating ? 'Stop Audio Processing' : 'Start Audio Processing'

  denoiseButton.disabled = !isGenerating
  denoiseButton.textContent = isDenoisingEnabled ? 'Disable Denoise' : 'Enable Denoise'

  playbackButton.disabled = !isGenerating
  playbackButton.textContent = isPlaying ? 'Stop Playback' : 'Start Playback'

  autoNoiseRadioButton.disabled = isGenerating
  micInputRadioButton.disabled = isGenerating

  echoCancellationCheckbox.disabled = isGenerating || !isMicMode || !micPermissionGranted
  noiseSuppressionCheckbox.disabled = isGenerating || !isMicMode || !micPermissionGranted
  autoGainControlCheckbox.disabled = isGenerating || !isMicMode || !micPermissionGranted

  // Microphone select element state
  if (isMicMode) {
    micSelectElement.disabled =
      !micPermissionGranted || availableMicDevices.length === 0 || isGenerating
  } else {
    micSelectElement.disabled = true
  }

  // Speaker select element state
  if (isSetSinkIdSupported) {
    speakerSelectElement.disabled =
      !micPermissionGranted || availableSpeakerDevices.length === 0 || isGenerating
    // Allow changing speaker while generating if conditions met
    if (isGenerating && micPermissionGranted && availableSpeakerDevices.length > 0) {
      speakerSelectElement.disabled = false
    }
  } else {
    speakerSelectElement.disabled = true // Always disabled if not supported
  }

  noiseScaleSlider.disabled = isMicMode || isGenerating
  noiseAlphaSlider.disabled = isMicMode || isGenerating
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

async function requestMicrophonePermission() {
  if (!requestMicPermissionButton || !micSelectElement) return

  try {
    // Request microphone permission
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    micPermissionGranted = true
    console.log('Microphone permission granted.')

    // Populate microphone list now that permission is granted
    await populateMicrophoneList()

    // Update UI states
    requestMicPermissionButton.disabled = true
    requestMicPermissionButton.textContent = 'Microphones Loaded'
    micSelectElement.disabled = availableMicDevices.length === 0
    if (availableMicDevices.length > 0 && micSelectElement.options.length > 0) {
      // If devices are found, and it's not just "No microphones found", enable generate button if in mic mode
      // This logic will be better handled in updateButtonLabelsAndState
    }
    // Stop the temporary stream used for permission request, if it's not going to be used immediately.
    // In this flow, startMicInput will get a new stream with specific deviceId.
    for (const track of stream.getTracks()) {
      track.stop()
    }
    // Populate speaker list as well, now that we have general media permission
    if (isSetSinkIdSupported) {
      await populateSpeakerList()
    }
  } catch (err) {
    console.error('Error requesting microphone permission:', err)
    micPermissionGranted = false
    alert('Failed to get microphone permission. Please check your browser settings.')
    micSelectElement.disabled = true
    // Ensure the button remains enabled to try again, or update its text
    requestMicPermissionButton.textContent = 'Retry Load Microphones'
    requestMicPermissionButton.disabled = false
  }
  updateButtonLabelsAndState() // Update all button states
}

async function populateSpeakerList() {
  if (!speakerSelectElement || !isSetSinkIdSupported || !micPermissionGranted) {
    if (speakerSelectElement) speakerSelectElement.disabled = true
    return
  }

  const previouslySelectedDeviceId = speakerSelectElement.value
  speakerSelectElement.innerHTML = '' // Clear existing options

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    availableSpeakerDevices = devices.filter((device) => device.kind === 'audiooutput')

    if (availableSpeakerDevices.length === 0) {
      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No speakers found'
      speakerSelectElement.appendChild(option)
      speakerSelectElement.disabled = true
      return
    }

    for (const device of availableSpeakerDevices) {
      const option = document.createElement('option')
      option.value = device.deviceId
      option.textContent = device.label || `Speaker ${speakerSelectElement.options.length + 1}`
      speakerSelectElement.appendChild(option)
    }

    if (
      previouslySelectedDeviceId &&
      speakerSelectElement.querySelector(`option[value="${previouslySelectedDeviceId}"]`)
    ) {
      speakerSelectElement.value = previouslySelectedDeviceId
    }

    // Attempt to set the initial speaker if one is selected/default
    if (outputAudioElement && speakerSelectElement.value) {
      try {
        await outputAudioElement.setSinkId(speakerSelectElement.value)
        console.log(
          `Initial audio output set to: ${speakerSelectElement.options[speakerSelectElement.selectedIndex].text}`,
        )
      } catch (setSinkIdError) {
        console.warn('Could not set initial speaker:', setSinkIdError)
        // If default speaker fails to set, it might be restricted. UI will show default anyway.
      }
    }
    speakerSelectElement.disabled = isGenerating // Disable if generating, enable otherwise
  } catch (err) {
    console.error('Error populating speaker list:', err)
    const option = document.createElement('option')
    option.value = ''
    option.textContent = 'Error listing speakers'
    speakerSelectElement.appendChild(option)
    speakerSelectElement.disabled = true
    availableSpeakerDevices = []
  }
}

async function handleSpeakerDeviceChange() {
  if (
    !speakerSelectElement ||
    !outputAudioElement ||
    !isSetSinkIdSupported ||
    !speakerSelectElement.value
  ) {
    return
  }
  try {
    await outputAudioElement.setSinkId(speakerSelectElement.value)
    console.log(
      `Audio output changed to: ${speakerSelectElement.options[speakerSelectElement.selectedIndex].text}`,
    )
  } catch (err) {
    console.error('Error setting audio output device (setSinkId):', err)
    alert(`Error changing speaker: ${(err as Error).name} - ${(err as Error).message}`)
    // Optionally revert to a known good state or inform user
  }
}

document.addEventListener('DOMContentLoaded', init)
