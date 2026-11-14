#!/bin/sh
# Runs the developer benchmark (src/bench.cjs) in the Dev app with its own data folder, so your Dev workspace is
# never touched. The folder is kept between runs (test media is generated once) and can be deleted at any time.
#   tools/bench.sh export,audio          (any VV_BENCH_* variables pass through)
cd "$(dirname "$0")/.." || exit 1
HOME_DIR="${VV_BENCH_HOME:-$HOME/Library/Caches/video-visor-bench}"
mkdir -p "$HOME_DIR"
VIDEO_VISOR_TEST_HOME="$HOME_DIR" VV_BENCH=1 VV_BENCH_ONLY="${1:-env,import,save,export}" "dist/Video Visor Dev.app/Contents/MacOS/Video Visor"
