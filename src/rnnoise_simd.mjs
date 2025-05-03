// The wasm module must be imported here first before the support file
// in order to avoid issues with circular dependencies.
import * as unused from './rnnoise_simd.wasm';
export { default, ___em_lib_deps_deps, _free, _malloc, _rnnoise_create, _rnnoise_destroy, _rnnoise_get_frame_size, _rnnoise_model_free, _rnnoise_model_from_string, _rnnoise_process_frame } from './rnnoise_simd.support.mjs';
