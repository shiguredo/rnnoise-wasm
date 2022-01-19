#! /bin/bash
set -eux

# 各種設定
EMSCRIPTEN_VERSION=3.1.0
RNNOISE_REPOSITORY=https://github.com/shiguredo/rnnoise
RNNOISE_VERSION=feature/rnn-model-from-string # TODO: 2022.1.0
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
  NAME="$3"

  mkdir $BUILD_DIR/$NAME
  cd $BUILD_DIR/$NAME

  git clone $RNNOISE_REPOSITORY rnnoise
  cd rnnoise/
  git checkout $RNNOISE_VERSION

  ./autogen.sh
  emconfigure ./configure --enable-shared=no $CONFIGURE_FLAGS
  emmake make

  emcc \
    -s STRICT=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s MALLOC=emmalloc \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORTED_FUNCTIONS="['_rnnoise_process_frame', '_rnnoise_destroy', '_rnnoise_create', '_rnnoise_get_frame_size', '_rnnoise_model_from_string', '_rnnoise_model_free', '_malloc', '_free']" \
    .libs/librnnoise.a \
    -o $NAME.js

  cd $ROOT_DIR
}

# 通常版をビルド
build_rnnoise "${OPTIMIZE}" "" "rnnoise"

# SIMD版をビルド
build_rnnoise "${OPTIMIZE} -msimd128" "--enable-wasm-simd" "rnnoise_simd"

# ビルド結果をコピー (JavaScriptファイルはSIMD対応・非対応のどちらでも同じなので使い回す）
mkdir -p dist
mv $BUILD_DIR/rnnoise/rnnoise/rnnoise.wasm dist/
mv $BUILD_DIR/rnnoise/rnnoise/rnnoise.js src/rnnoise_wasm.js
mv $BUILD_DIR/rnnoise_simd/rnnoise/rnnoise_simd.wasm dist/

# 一時ディレクトリを削除
rm -rf $BUILD_DIR
