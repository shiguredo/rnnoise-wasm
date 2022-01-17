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

## 2022.1.0

- [CHANGE] `Rnnoise` クラスのインタフェース見直しと `DenoiseState` クラスの追加
    - `Rnnoise` クラスの責務を wasm ファイル管理と RNNoise のステートレス関数の提供に限定し、それ以外は `DenoiseState` に分離
    - https://github.com/shiguredo/rnnoise-wasm/pull/14
    - @sile
- [CHANGE] 内部 API を型定義ファイルに含めないように変更
    - https://github.com/shiguredo/rnnoise-wasm/pull/15
    - @sile

## 2021.1.0

**初リリース**
- @shiguredo/rnnoise-wasm を npm に登録
- RNNoise は shiguredo/rnnoise の 2021.1.0 を使用
- Emscripten は v3.1.0 を使用
