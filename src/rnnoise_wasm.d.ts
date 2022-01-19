export type F32Ptr = number;
export type ConstCharPtr = number;
export type DenoiseState = number;
export type RNNModel = number;

export interface RnnoiseModule extends EmscriptenModule {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_create(model?: RNNModel): DenoiseState;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_process_frame(state: DenoiseState, input_buf: F32Ptr, output_buf: F32Ptr): number;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_destroy(state: DenoiseState): void;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_get_frame_size(): number;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_model_from_string(modelString: ConstCharPtr): RNNModel;

  // eslint-disable-next-line @typescript-eslint/naming-convention
  _rnnoise_model_free(mode: RNNModel): void;
}

export interface LoadRnnoiseModuleOptions {
  locateFile?: (path: string, prefix: string) => string;
}

export default function loadRnnoiseModule(options?: LoadRnnoiseModuleOptions): Promise<RnnoiseModule>;
