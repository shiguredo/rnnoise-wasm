import { simd } from "wasm-feature-detect";
import loadRnnoiseModule from "./rnnoise_wasm.js";
import { RnnoiseModule, DenoiseState, F32Ptr } from "./rnnoise_wasm.js";

/**
 * {@link Rnnoise.load} 関数に指定可能なオプション
 */
interface RnnoiseOptions {
  /**
   * wasm ファイルの配置先ディレクトリパス
   *
   * デフォルトでは `rnnoise.js` の配置先と同じディレクトリが使用されます
   */
  assetsPath?: string;

  /**
   * @internal
   *
   * 使用する wasm ファイルの名前（テスト用オプション）
   */
  wasmFileName?: string;
}

/**
 * WebAssembly 用にビルドした [RNNoise](https://github.com/shiguredo/rnnoise) を用いて音声データのノイズ抑制を行うためのクラス
 *
 * インスタンスを作成するためには {@link Rnnoise.load} 関数を使用してください
 */
class Rnnoise {
  private rnnoiseModule: RnnoiseModule;
  private denoiseState: DenoiseState;
  private pcmInputBuf: F32Ptr;
  private pcmOutputBuf: F32Ptr;

  /**
   * 一度の {@link Rnnoise.processFrame} メソッド呼び出しで処理可能なサンプル数
   */
  readonly frameSize: number;

  private constructor(rnnoiseModule: RnnoiseModule) {
    this.rnnoiseModule = rnnoiseModule;
    this.denoiseState = rnnoiseModule._rnnoise_create();
    this.frameSize = rnnoiseModule._rnnoise_get_frame_size();

    const pcmInputBuf = rnnoiseModule._malloc(this.frameSize * 4);
    const pcmOutputBuf = rnnoiseModule._malloc(this.frameSize * 4);
    if (!pcmInputBuf || !pcmOutputBuf) {
      // `rnnoiseModule`がGCされればwasm用に割り当てた領域もまとめて解放されるので、
      // 個別の領域解放処理は省いている。
      throw Error("Failed to allocate PCM buffers.");
    }
    this.pcmInputBuf = pcmInputBuf;
    this.pcmOutputBuf = pcmOutputBuf;
  }

  /**
   * wasm ファイルをロードして {@link Rnnoise} のインスタンスを生成する関数
   *
   * @param options 指定可能なオプション群
   * @returns 生成された {@link Rnnoise} インスタンス
   *
   * @remarks
   * 実行環境が WebAssembly の SIMD に対応している場合には、SIMD 版の wasm ファイルがロードされます
   */
  static async load(options: RnnoiseOptions = {}): Promise<Rnnoise> {
    const rnnoiseModule = await simd().then((isSupported) => {
      return loadRnnoiseModule({
        locateFile: (path, prefix) => {
          if (options.assetsPath !== undefined) {
            prefix = options.assetsPath + "/";
          }

          if (options.wasmFileName !== undefined) {
            path = options.wasmFileName;
            console.debug("Loads rnnoise-wasm: ", prefix + path);
          } else if (isSupported) {
            path = "rnnoise_simd.wasm";
            console.debug("Loads rnnoise-wasm (SIMD ver): ", prefix + path);
          } else {
            console.debug("Loads rnnoise-wasm (non SIMD ver): ", prefix + path);
          }

          return prefix + path;
        },
      });
    });

    return Promise.resolve(new Rnnoise(rnnoiseModule));
  }

  /**
   * 音声フレームにノイズ抑制処理を適用するメソッド
   *
   * @param frame ノイズ抑制処理の対象となる音声フレーム

   * @returns
   * VAD (voice-activity-detection) の結果を返します
   *
   * 結果の範囲は0から1で、値が大きいほど、入力音声フレームに人の声が含まれている可能性が高いことを意味します
   *
   * @throws
   * 入力音声フレームに含まれるサンプルの数 (`frame.length`) が {@link Rnnoise.frameSize} と異なる場合にエラーが送出されます
   *
   * @remarks
   * RNNoise は入力音声フレームが 16ビットPCM であると仮定しているため、
   * それ以外のフォーマットのフレームを処理したい場合には、
   * 呼び出し側で事前に変換を行っておく必要があります
   */
  processFrame(frame: Float32Array): number {
    if (frame.length != this.frameSize) {
      throw Error(`Expected frame size ${this.frameSize}, but got ${frame.length}`);
    }

    const pcmInputIndex = this.pcmInputBuf / 4;
    const pcmOutputIndex = this.pcmOutputBuf / 4;

    this.rnnoiseModule.HEAPF32.set(frame, pcmInputIndex);
    const vad = this.rnnoiseModule._rnnoise_process_frame(this.denoiseState, this.pcmOutputBuf, this.pcmInputBuf);
    frame.set(this.rnnoiseModule.HEAPF32.subarray(pcmOutputIndex, pcmOutputIndex + this.frameSize));

    return vad;
  }
}

export { Rnnoise, RnnoiseOptions };
