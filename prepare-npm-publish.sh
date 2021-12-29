#!/bin/bash
#
# npmリリースの準備を行うためのスクリプトです。
# 実際にリリースコマンド (`$ npm publish --access public`) の実行までは行いません。
# また、事前に該当バージョンのGitHubリリースの作成とGitHub Actionsによるwasmのビルドが実施されている必要があります。
#
# [使い方]
# $ ./prepare-npm-publish.sh ${バージョン番号}

set -eux

VERSION=$1

# バージョンチェック
ACTUAL_VERSION=$(jq -r .version package.json)
if [ "$VERSION" != "$ACTUAL_VERSION" ]; then
  echo "The specified version '$VERSION' doesn't match with the actual version '$ACTUAL_VERSION' in package.json."
  exit 1
fi

# ビルド済みファイルのダウンロード
rm -rf dist
mkdir dist
cd dist/
curl -fsSLO https://github.com/shiguredo/rnnoise-wasm/releases/download/$VERSION/rnnoise.mjs
curl -fsSLO https://github.com/shiguredo/rnnoise-wasm/releases/download/$VERSION/rnnoise.d.ts
curl -fsSLO https://github.com/shiguredo/rnnoise-wasm/releases/download/$VERSION/rnnoise.wasm
curl -fsSLO https://github.com/shiguredo/rnnoise-wasm/releases/download/$VERSION/rnnoise_simd.wasm
cd ../

# ドライラン
npm publish --dry-run

echo 'Done!'

echo 'Please execute the following command to publish the version to the npm:'
echo '$ npm publish --access public'
