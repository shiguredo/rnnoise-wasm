#! /bin/bash
set -eux

EMSCRIPTEN_VERSION=3.0.0

if ! which emcc >/dev/null; then
  echo "Please install emscripten-${EMSCRIPTEN_VERSION}"
  exit 1
fi

EMSCRIPTEN_ACTUAL_VERSION=$(emcc --version | head -1 | grep -o -E '[0-9]+[.][0-9]+[.][0-9]')
if [ "$EMSCRIPTEN_ACTUAL_VERSION" != "$EMSCRIPTEN_VERSION" ]; then
  echo "Please install emscripten-${EMSCRIPTEN_VERSION} (found version ${EMSCRIPTEN_ACTUAL_VERSION})"
  exit 1
fi

export OPTIMIZE="-Os"
export LDFLAGS=${OPTIMIZE}
export CFLAGS=${OPTIMIZE}
export CXXFLAGS=${OPTIMIZE}

if [[ `uname` == "Darwin"  ]]; then
  SO_SUFFIX="dylib"
else
  SO_SUFFIX="so"
fi

unset BUILD_DIR
trap '[[ "$BUILD_DIR" ]] && rm -f $BUILD_DIR' 1 2 3 15

BUILD_DIR=$(mktemp -d)

ROOT_DIR=$PWD

mkdir -p $BUILD_DIR
cd $BUILD_DIR

git clone https://github.com/shiguredo/rnnoise.git
cd rnnoise/

./autogen.sh

emconfigure ./configure CFLAGS=${OPTIMIZE} --enable-static=no --disable-examples --disable-doc
emmake make clean
emmake make V=1

emcc \
  ${OPTIMIZE} \
  -s STRICT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MALLOC=emmalloc \
  -s MODULARIZE=1 \
  -s ENVIRONMENT="web,worker" \
  -s EXPORT_ES6=1 \
  -s USE_ES6_IMPORT_META=0 \
  -s EXPORTED_FUNCTIONS="['_rnnoise_process_frame', '_rnnoise_destroy', '_rnnoise_create', '_rnnoise_get_frame_size', '_malloc', '_free']" \
  .libs/librnnoise.${SO_SUFFIX} \
  -o rnnoise.js

cd $ROOT_DIR
mkdir -p dist

mv $BUILD_DIR/rnnoise/rnnoise.wasm dist/
mv $BUILD_DIR/rnnoise/rnnoise.js src/rnnoise_wasm.js

rm -rf $BUILD_DIR
