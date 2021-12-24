#! /bin/bash
set -eux

# 各種設定
EMSCRIPTEN_VERSION=3.0.0
RNNOISE_REPOSITORY=https://github.com/shiguredo/rnnoise
RNNOISE_VERSION=feature/support-wasm-simd #master
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

unset BUILD_DIR
trap '[[ "$BUILD_DIR" ]] && rm -f $BUILD_DIR' 1 2 3 15

BUILD_DIR=$(mktemp -d)

ROOT_DIR=$PWD

mkdir -p $BUILD_DIR
cd $BUILD_DIR

git clone $RNNOISE_REPOSITORY rnnoise
cd rnnoise/
git checkout $RNNOISE_VERSION

export CFLAGS="${OPTIMIZE} -msimd128"

./autogen.sh
emconfigure ./configure --enable-wasm-simd --enable-shared=no
emmake make

emcc \
  -s STRICT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MALLOC=emmalloc \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORTED_FUNCTIONS="['_rnnoise_process_frame', '_rnnoise_destroy', '_rnnoise_create', '_rnnoise_get_frame_size', '_malloc', '_free']" \
  .libs/librnnoise.a \
  -o rnnoise.js

cd $ROOT_DIR
mkdir -p dist

mv $BUILD_DIR/rnnoise/rnnoise.wasm dist/
mv $BUILD_DIR/rnnoise/rnnoise.js src/rnnoise_wasm.js

rm -rf $BUILD_DIR
