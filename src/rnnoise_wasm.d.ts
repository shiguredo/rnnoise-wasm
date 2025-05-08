export type F32Ptr = number
export type ConstCharPtr = number
export type DenoiseState = number
export type RNNModel = number

export interface RnnoiseModule extends EmscriptenModule {
  _rnnoise_create(model?: RNNModel): DenoiseState

  _rnnoise_process_frame(state: DenoiseState, input_buf: F32Ptr, output_buf: F32Ptr): number

  _rnnoise_destroy(state: DenoiseState): void

  _rnnoise_get_frame_size(): number
}

export default function loadRnnoiseModule(): Promise<RnnoiseModule>
