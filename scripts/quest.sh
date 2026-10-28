#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
ADB="${ANDROID_HOME:-$PWD/.tools/android-sdk}/platform-tools/adb"
if [[ ! -x "$ADB" ]]; then ADB="$(command -v adb)"; fi
case "${1:-devices}" in
  devices) "$ADB" devices -l ;;
  install)
    "$ADB" install -r app/build/outputs/apk/debug/app-debug.apk
    "$ADB" shell am start -a android.intent.action.MAIN -c com.oculus.intent.category.OVERLAY_LAUNCHER -n dev.t3quest/.MainActivity ;;
  launch) "$ADB" shell am start -a android.intent.action.MAIN -c com.oculus.intent.category.OVERLAY_LAUNCHER -n dev.t3quest/.MainActivity ;;
  reverse) "$ADB" reverse tcp:8787 tcp:8787 ;;
  logs) "$ADB" logcat -s T3Quest AndroidRuntime ;;
  collect)
    mkdir -p captures
    "$ADB" exec-out run-as dev.t3quest cat files/events.jsonl > captures/events.jsonl
    if "$ADB" exec-out run-as dev.t3quest cat files/probe.wav > captures/probe.wav; then
      echo 'Saved captures/events.jsonl and captures/probe.wav'
    else
      rm -f captures/probe.wav
      echo 'Saved captures/events.jsonl. No recording exists yet.'
    fi ;;
  *) echo 'Usage: scripts/quest.sh [devices|install|launch|reverse|logs|collect]' >&2; exit 2 ;;
esac
