#! /bin/bash
set -eux

# 各種設定
EMSCRIPTEN_VERSION=4.0.8
RNNOISE_REPOSITORY=https://github.com/xiph/rnnoise
RNNOISE_VERSION=70f1d256acd4b34a572f999a05c87bf00b67730d
OPTIMIZE="-O2"

# Emscriptenのバージョンチェック
if ! which emcc >/dev/null; then
  echo "Please install emscripten-${EMSCRIPTEN_VERSION}"
  exit 1
fi

EMSCRIPTEN_ACTUAL_VERSION=$(emcc --version | head -1 | grep -o -E '[0-9]+[.][0-9]+[.][0-9]')
if [ "$EMSCRIPTEN_ACTUAL_VERSION" != "$EMSCRIPTEN_VERSION" ]; then
  echo "Please install emscripten-${EMSCRIPTEN_VERSION} (found version ${EMSCRIPTEN_ACTUAL_VERSION})"
  exit 1
fi

# 作業用の一時ディレクトリを作成
unset BUILD_DIR
trap '[[ "$BUILD_DIR" ]] && rm -f $BUILD_DIR' 1 2 3 15
BUILD_DIR=$(mktemp -d)
mkdir -p $BUILD_DIR

# カレントディレクトリを覚えておく
# ※rnnoise-wasmリポジトリのルートディレクトリで実行されていることを仮定している
ROOT_DIR=$PWD

# ビルド関数
function build_rnnoise() {
  export CFLAGS="$1"
  CONFIGURE_FLAGS="$2"

  mkdir $BUILD_DIR/rnnoise
  cd $BUILD_DIR/rnnoise

  git clone $RNNOISE_REPOSITORY rnnoise
  cd rnnoise/
  git checkout $RNNOISE_VERSION

  ./autogen.sh
  emconfigure ./configure --enable-shared=no $CONFIGURE_FLAGS
  emmake make

  # [NOTE]
  # STACK_SIZE のデフォルト値は 64 KB だけど、これだと実行時に
  # メモリエラーが出たので大きめの値を指定している。
  # 試した範囲では 70 KB ではエラーとなり、80 KB では大丈夫だった。
  emcc \
    -s STRICT=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MALLOC=emmalloc \
    -s SINGLE_FILE=1 \
    -s STACK_SIZE=200KB \
    -s ENVIRONMENT=web \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_RUNTIME_METHODS=HEAPF32 \
    -s EXPORTED_FUNCTIONS="['_rnnoise_process_frame', '_rnnoise_destroy', '_rnnoise_create', '_rnnoise_get_frame_size', '_malloc', '_free']" \
    .libs/librnnoise.a \
    -o rnnoise.mjs

  cd $ROOT_DIR
}

# ビルド
build_rnnoise "${OPTIMIZE}" ""

# TODO: SIMD に対応する際のコマンド
# build_rnnoise "${OPTIMIZE} -msimd128" "--enable-x86-rtcd "

# ビルド結果をコピー
mv $BUILD_DIR/rnnoise/rnnoise/rnnoise.mjs src/rnnoise_wasm.js

# 一時ディレクトリを削除
rm -rf $BUILD_DIR
