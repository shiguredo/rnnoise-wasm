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

- [CHANGE] wasm ファイルをビルドの js ファイルに埋め込むようにする
  - 今まではブラウザの SIMD 対応の有無によって使用する wasm ファイルを切り替えていたこともあって、js ファイルと wasm ファイルが分かれていたが、それが不要となったため埋め込むようにした
  - この変更により RNNoise インスタンス生成時にオプションで指定する項目がなくなったため `RnnoiseOptions` インタフェースも削除する
  - @sile
- [CHANGE] wasm-feature-detect を依存パッケージから削除する
  - Wasm の実行環境（ブラウザ）が SIMD に対応しているかどうかを判定するために使っていた
  - 現在では、主要なブラウザは全て SIMD Wasm に対応しているので、この判定は不要になったと判断して削除する
  - @sile
- [CHANGE] 外部モデル指定機能を削除する
  - rnnoise のフォークなしでは対応できない（本家ではモデルのファイルパス指定しかできず Wasm と相性が良くない）、かつ、ほとんど使われていない、機能なので xiph/rnnoise を直接参照するように変更するタイミングで機能を削除してしまう
  - 合わせて `Model` クラスが削除された
  - @sile
- [CHANGE] SIMD 対応をいったん外す
  - xiph/rnnoise を直接参照するようにした関係で SIMD 対応が一時的になくなった（将来的に復活予定）
  - @sile
- [UPDATE] RNNoise を v0.2 系に更新する
  - xiph/rnnoise の開発やメンテナンスが再開したので、フォーク版ではなく本家を参照するように変更する
  - 0.2 のタグは一年前のものであり、Wasm ビルドにも失敗したため、最新コミットのハッシュで参照するようにしている
  - @sile
- [ADD] 開発支援ツールとして DevTools を追加し、getUserMedia を使用したマイク音声入力機能を提供
  - `pnpm run dev` で起動
  - @voluntas
- [CHANGE] `Emscripten` のバージョンを 4.0.8 にアップデートする
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
