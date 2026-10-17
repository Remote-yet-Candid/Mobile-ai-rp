#!/usr/bin/env bash
set -euo pipefail
repository_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repository_dir"
abi=arm64-v8a
check_only=false
for argument in "$@"; do
  case "$argument" in
    --check) check_only=true ;;
    --abi=arm64-v8a) abi=arm64-v8a ;;
    --abi=x86_64) abi=x86_64 ;;
    *) echo 'Usage: pnpm apk:local [--check] [--abi=arm64-v8a|--abi=x86_64]'; exit 2 ;;
  esac
done
artifact_abi="$abi"
if [ "$abi" = arm64-v8a ]; then artifact_abi=arm64; fi
export ANDROID_HOME="${ANDROID_HOME:-/workspace/.android-sdk}"
export ANDROID_SDK_ROOT="$ANDROID_HOME"
export JAVA_HOME="${JAVA_HOME:-/workspace/.mobile-ai-rp-native/jdk17}"
export GRADLE_USER_HOME="${GRADLE_USER_HOME:-/workspace/.mobile-ai-rp-gradle}"
export EXPO_NO_TELEMETRY=1
export CI=1
test -x "$JAVA_HOME/bin/java" || { echo 'Prepare JDK 17; see docs/LOCAL_ANDROID.md'; exit 1; }
test -d "$ANDROID_HOME/platforms" || { echo 'Prepare the Android SDK; see docs/LOCAL_ANDROID.md'; exit 1; }
test -f "$GRADLE_USER_HOME/gradle.properties" || { echo 'Prepare proxy and CA trust; see docs/LOCAL_ANDROID.md'; exit 1; }
if [ "$check_only" = true ]; then
  "$JAVA_HOME/bin/java" -version
  echo 'Native toolchain paths exist. No build or device validation performed.'
  exit 0
fi
if [ ! -d apps/mobile/android ]; then
  EXPO_OFFLINE=1 pnpm --filter @mobile-ai-rp/mobile exec expo prebuild --platform android --no-install
fi
python3 - <<'PY'
from pathlib import Path
p = Path('apps/mobile/android/gradle/wrapper/gradle-wrapper.properties')
text = p.read_text()
expected_url = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.4.1-bin.zip'
expected_sha = '2ab2958f2a1e51120c326cad6f385153bb11ee93b3c216c5fccebfdfbb7ec6cb'
assert expected_url in text, 'Review the new Gradle distribution and its official checksum first'
if 'distributionSha256Sum=' in text:
    assert f'distributionSha256Sum={expected_sha}' in text, 'Gradle checksum mismatch'
else:
    p.write_text(text + '\ndistributionSha256Sum=' + expected_sha + '\n')
PY
mkdir -p artifacts
cd apps/mobile/android
# Workspace packages live outside Gradle's app-root input tree. Refresh JS explicitly,
# while retaining native compilation outputs instead of forcing every native task again.
./gradlew :app:createBundleReleaseJsAndAssets --rerun-tasks --no-daemon --max-workers=2 2>&1 | tee "$repository_dir/artifacts/android-local-$artifact_abi-bundle.log"
./gradlew :app:assembleRelease "-PreactNativeArchitectures=$abi" --no-daemon --max-workers=2 2>&1 | tee "$repository_dir/artifacts/android-local-$artifact_abi-build.log"
cd "$repository_dir"
apk="artifacts/mobile-ai-rp-gate0-$artifact_abi.apk"
cp apps/mobile/android/app/build/outputs/apk/release/app-release.apk "$apk"
"$ANDROID_HOME/build-tools/37.0.0/apksigner" verify --verbose --print-certs "$apk"
sha256sum "$apk"
echo 'Release-mode probe uses the generated DEBUG test signing key. It is not a production/EAS release.'
