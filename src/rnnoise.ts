import loadRnnoiseModule from "./rnnoise_wasm.js";
import { RnnoiseModule, DenoiseState, F32Ptr } from "./rnnoise_wasm.js";

class Rnnoise {
  private rnnoiseModule: RnnoiseModule;
  private denoiseState: DenoiseState;
  private pcmInputBuf: F32Ptr;
  private pcmOutputBuf: F32Ptr;
  private frameSize: number;

  private constructor(rnnoiseModule: RnnoiseModule) {
    this.rnnoiseModule = rnnoiseModule;
    this.denoiseState = rnnoiseModule._rnnoise_create();
    this.frameSize = rnnoiseModule._rnnoise_get_frame_size();

    const pcmInputBuf = rnnoiseModule._malloc(this.frameSize * 4);
    const pcmOutputBuf = rnnoiseModule._malloc(this.frameSize * 4);
    if (!pcmInputBuf || !pcmOutputBuf) {
      // `rnnoiseModule`がGCされればwasm用に割り当てた領域もまとめて解放されるので、
      // 個別の領域解放処理は省いている。
      // TODO: 本当にそういう挙動なのかを確認
      throw Error("Failed to allocate PCM buffers.");
    }
    this.pcmInputBuf = pcmInputBuf;
    this.pcmOutputBuf = pcmOutputBuf;
  }

  static async load(wasmFilePath?: string): Promise<Rnnoise> {
    const rnnoiseModule = await loadRnnoiseModule({
      locateFile: (path, prefix) => {
        return wasmFilePath || prefix + path;
      },
    });

    return Promise.resolve(new Rnnoise(rnnoiseModule));
  }

  // 16-bit PCM
  processFrame(frame: Float32Array): number {
    if (frame.length != this.getFrameSize()) {
      throw Error(`Expected frame size ${this.getFrameSize()}, but got ${frame.length}`);
    }

    const pcmInputIndex = this.pcmInputBuf / 4;
    const pcmOutputIndex = this.pcmOutputBuf / 4;

    this.rnnoiseModule.HEAPF32.set(frame, pcmInputIndex);
    const vad = this.rnnoiseModule._rnnoise_process_frame(this.denoiseState, this.pcmOutputBuf, this.pcmInputBuf);
    frame.set(this.rnnoiseModule.HEAPF32.subarray(pcmOutputIndex, pcmOutputIndex + this.frameSize));

    return vad;
  }

  getFrameSize(): number {
    return this.frameSize;
  }
}

export { Rnnoise };