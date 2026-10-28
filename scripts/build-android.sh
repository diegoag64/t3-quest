#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ -x .tools/jdk/bin/java ]]; then export JAVA_HOME="$PWD/.tools/jdk"; fi
export GRADLE_USER_HOME="$PWD/.tools/gradle-cache"
if [[ -x .tools/gradle-8.11.1/bin/gradle ]]; then
  exec .tools/gradle-8.11.1/bin/gradle --no-daemon --console=plain :app:assembleDebug "$@"
elif command -v gradle >/dev/null; then
  exec gradle --no-daemon --console=plain :app:assembleDebug "$@"
else
  echo 'Install build tools first: python3 scripts/setup-tools.py' >&2
  exit 1
fi
