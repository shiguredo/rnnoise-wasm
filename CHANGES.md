# 変更履歴

- UPDATE
  - 下位互換がある変更
- ADD
  - 下位互換がある追加
- CHANGE
  - 下位互換のない変更
- FIX
  - バグ修正

## develop

- [ADD] 開発支援ツールとして DevTools を追加し、getUserMedia を使用したマイク音声入力機能を提供
  - `pnpm run dev` で起動
  - @voluntas
- [CHANGE] `Emscripten` のバージョンを 4.0.8 にアップデートする
  - @voluntas
- [CHANGE] SIMD 版の RNNoise をデフォルトで使用するように変更
  - @voluntas

### misc

- [ADD] playwright を追加
  - @voluntas
- [ADD] devtools の E2E テストを追加
  - @voluntas
- [CHANGE] npm から pnpm に変更する
  - @voluntas
- [CHANGE] Rollup から Vite に変更する
  - @voluntas
- [CHANGE] Jest から Vitest に変更する
  - @voluntas
- [CHANGE] ESLint から Biome に変更する
  - @voluntas
- [CHANGE] GitHub Actions の ubuntu-latest を ubuntu-24.04 に変更
  - @voluntas

## 2022.2.0

- [ADD] RNNoise のモデルの差し替えに対応
  - <https://github.com/shiguredo/rnnoise-wasm/pull/16>
  - @sile

## 2022.1.0

- [CHANGE] `Rnnoise` クラスのインタフェース見直しと `DenoiseState` クラスの追加
  - `Rnnoise` クラスの責務を wasm ファイル管理と RNNoise のステートレス関数の提供に限定し、それ以外は `DenoiseState` に分離
  - <https://github.com/shiguredo/rnnoise-wasm/pull/14>
  - @sile
- [CHANGE] 内部 API を型定義ファイルに含めないように変更
  - <https://github.com/shiguredo/rnnoise-wasm/pull/15>
  - @sile

## 2021.1.0

**初リリース**

- @shiguredo/rnnoise-wasm を npm に登録
- RNNoise は shiguredo/rnnoise の 2021.1.0 を使用
- Emscripten は v3.1.0 を使用
