rnnoise-wasm
============

[![GitHub tag](https://img.shields.io/github/tag/shiguredo/rnnoise-wasm.svg)](https://github.com/shiguredo/rnnoise-wasm)
[![npm version](https://badge.fury.io/js/@shiguredo%2Frnnoise-wasm.svg)](https://badge.fury.io/js/@shiguredo%2Frnnoise-wasm)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

[RNNoise](https://github.com/shiguredo/rnnoise) を WebAssembly (wasm) にビルドして
JavaScript や TypeScript から利用するためのライブラリです。

WebAssembly の SIMD に対応しているブラウザでは、自動的に SIMD版 の wasm ビルドが使用されます。

## About Shiguredo's open source software

We will not respond to PRs or issues that have not been discussed on Discord. Also, Discord is only available in Japanese.

Please read https://github.com/shiguredo/oss/blob/master/README.en.md before use.

## 時雨堂のオープンソースソフトウェアについて

利用前に https://github.com/shiguredo/oss をお読みください。

## 使い方

以下のコマンドでパッケージがインストールできます:
```console
$ npm install --save @shiguredo/rnnoise-wasm
$ npm ls
└── @shiguredo/rnnoise-wasm@2022.2.0
```

TypeScript での使用方法は次のようになります:
```typescript
import { Rnnoise } from "@shiguredo/rnnoise-wasm";

// RNNoise の wasm ファイルをロード
Rnnoise.load().then((rnnoise) => {
    // ノイズ抑制用インスタンスを生成
    const denoiseState = rnnoise.createDenoiseState();

    // 音声フレームにノイズ抑制処理を適用する
    const frame = new Float32Array(...);
    rnnoise.processFrame(frame);

    ...

    // インスタンスを破棄して wasm 用に割り当てたメモリを解放
    denoiseState.destroy();
});
```

## ライセンス

[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)

```
Copyright 2021-2021, Takeru Ohta (Original Author)
Copyright 2021-2021, Shiguredo Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

生成された wasm ファイルのライセンスについては [rnnoise/COPYING](https://github.com/shiguredo/rnnoise) を参照してください。
