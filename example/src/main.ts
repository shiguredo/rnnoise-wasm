import { NoiseSuppressionProcessor } from './noise_suppression'

document.addEventListener('DOMContentLoaded', async () => {
  if (!NoiseSuppressionProcessor.isSupported()) {
    alert('Unsupported platform')
    throw Error('Unsupported platform')
  }

  const assetsPath = '.'
  const processor = new NoiseSuppressionProcessor(assetsPath)

  let audioCtx: AudioContext | undefined
  let analyserOriginal: AnalyserNode | undefined
  let analyserProcessed: AnalyserNode | undefined
  let sourceOriginal: MediaStreamAudioSourceNode | undefined
  let sourceProcessed: MediaStreamAudioSourceNode | undefined

  function initAudioAnalysersIfNeed() {
    if (audioCtx === undefined) {
      audioCtx = new window.AudioContext()

      analyserOriginal = audioCtx.createAnalyser()
      visualize(
        analyserOriginal,
        document.getElementById('oscilloscopeOriginal') as HTMLCanvasElement,
      )

      analyserProcessed = audioCtx.createAnalyser()
      visualize(
        analyserProcessed,
        document.getElementById('oscilloscopeProcessed') as HTMLCanvasElement,
      )
    }
  }

  function getUserMedia() {
    const constraints = {
      audio: {
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 480 },
        channelCount: { exact: 1 },
      },
    }
    return navigator.mediaDevices.getUserMedia(constraints).then((stream) => {
      initAudioAnalysersIfNeed()

      if (sourceOriginal !== undefined) {
        sourceOriginal.disconnect()
      }
      if (audioCtx === undefined) {
        throw Error('audio context not found')
      }
      sourceOriginal = audioCtx.createMediaStreamSource(stream)
      if (analyserOriginal === undefined) {
        throw Error('analyser not found')
      }
      sourceOriginal.connect(analyserOriginal)

      return stream
    })
  }

  function playOriginalAudio() {
    processor.stopProcessing()

    getUserMedia().then((stream) => {
      if (sourceProcessed !== undefined) {
        sourceProcessed.disconnect()
        sourceProcessed = undefined
      }
      const audioElement = document.querySelector<HTMLMediaElement>('#audio')
      if (audioElement === null) {
        throw Error('audio element not found')
      }
      audioElement.srcObject = stream
    })
  }

  function playProcessedAudio() {
    processor.stopProcessing()

    const audioElement = document.querySelector<HTMLMediaElement>('#audio')
    if (audioElement === null) {
      throw Error('audio element not found')
    }
    getUserMedia().then((stream) => {
      const track = stream.getAudioTracks()[0]
      processor.startProcessing(track).then((processed_track) => {
        const stream = new MediaStream([processed_track])

        if (sourceProcessed !== undefined) {
          sourceProcessed.disconnect()
        }
        if (audioCtx === undefined) {
          throw Error('audio context not found')
        }
        sourceProcessed = audioCtx.createMediaStreamSource(stream)
        if (analyserProcessed === undefined) {
          throw Error('analyser not found')
        }
        sourceProcessed.connect(analyserProcessed)

        if (audioElement === null) {
          throw Error('audio element not found')
        }
        audioElement.srcObject = stream
      })
    })
  }

  function stopAudio() {
    const audioElement = document.querySelector<HTMLMediaElement>('#audio')
    if (audioElement === null) {
      throw Error('audio element not found')
    }
    audioElement.pause()

    if (sourceOriginal !== undefined) {
      sourceOriginal.disconnect()
      sourceOriginal = undefined
    }
    if (sourceProcessed !== undefined) {
      sourceProcessed.disconnect()
      sourceProcessed = undefined
    }
  }

  function visualize(analyser: AnalyserNode, canvas: HTMLCanvasElement) {
    requestAnimationFrame(() => {
      visualize(analyser, canvas)
    })

    const bufferLength = analyser.frequencyBinCount
    const dataArray = new Uint8Array(bufferLength)
    analyser.getByteTimeDomainData(dataArray)

    const canvasCtx = canvas.getContext('2d')
    if (canvasCtx === null) {
      throw Error('canvas context not found')
    }
    canvasCtx.fillStyle = 'rgb(200, 200, 200)'
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

    let silence = true
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] !== 128) {
        silence = false
        break
      }
    }
    if (silence) {
      return
    }

    canvasCtx.lineWidth = 2
    canvasCtx.strokeStyle = 'rgb(0, 0, 0)'
    canvasCtx.beginPath()
    const sliceWidth = (canvas.width * 1.0) / bufferLength
    let x = 0
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0
      const y = (v * canvas.height) / 2

      if (i === 0) {
        canvasCtx.moveTo(x, y)
      } else {
        canvasCtx.lineTo(x, y)
      }

      x += sliceWidth
    }
    canvasCtx.lineTo(canvas.width, canvas.height / 2)
    canvasCtx.stroke()
  }

  function clearCanvas(canvas: HTMLCanvasElement) {
    const canvasCtx = canvas.getContext('2d')
    if (canvasCtx === null) {
      throw Error('canvas context not found')
    }
    canvasCtx.fillStyle = 'rgb(200, 200, 200)'
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height)
  }

  document.getElementById('playProcessedAudio')?.addEventListener('click', playProcessedAudio)
  document.getElementById('playOriginalAudio')?.addEventListener('click', playOriginalAudio)
  document.getElementById('stopAudio')?.addEventListener('click', stopAudio)

  clearCanvas(document.getElementById('oscilloscopeOriginal') as HTMLCanvasElement)
  clearCanvas(document.getElementById('oscilloscopeProcessed') as HTMLCanvasElement)
})
