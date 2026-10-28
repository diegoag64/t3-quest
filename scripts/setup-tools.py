#!/usr/bin/env python3
"""Install a pinned, project-local Android build toolchain on Apple Silicon macOS."""
import hashlib
import json
import pathlib
import platform
import shutil
import subprocess
import tarfile
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOOLS = ROOT / '.tools'

def download(url, target, checksum=None, algorithm='sha256'):
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        print('Downloading ' + target.name, flush=True)
        subprocess.run(['curl', '-fL', '--retry', '3', '--connect-timeout', '20', url, '-o', str(target)], check=True)
    if checksum and hashlib.new(algorithm, target.read_bytes()).hexdigest() != checksum:
        target.unlink()
        raise RuntimeError('Checksum mismatch: ' + target.name)
    return target

def main():
    if platform.system() != 'Darwin' or platform.machine() != 'arm64':
        raise SystemExit('This bootstrap targets Apple Silicon macOS. Other hosts: install JDK 17, Android SDK 35, and Gradle 8.11.1; see docs/setup.md.')
    TOOLS.mkdir(exist_ok=True)
    jdk = download(
        'https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.21%2B9/OpenJDK17U-jdk_aarch64_mac_hotspot_17.0.21_9.tar.gz',
        TOOLS / 'downloads/jdk.tar.gz',
        '78b08c7f5a0598242d5719c022e19479cb4a3aa45c37c19726a757a469ed1c15')
    if not (TOOLS / 'jdk').exists():
        extract = TOOLS / 'jdk-extract'
        extract.mkdir(exist_ok=True)
        with tarfile.open(jdk) as archive:
            # The archive is from the pinned official release and verified above.
            archive.extractall(extract)
        shutil.move(str(next(extract.iterdir()) / 'Contents/Home'), str(TOOLS / 'jdk'))
        shutil.rmtree(extract)
    gradle_sha = download('https://services.gradle.org/distributions/gradle-8.11.1-bin.zip.sha256', TOOLS / 'downloads/gradle.sha256').read_text().strip()
    gradle = download('https://services.gradle.org/distributions/gradle-8.11.1-bin.zip', TOOLS / 'downloads/gradle.zip', gradle_sha)
    if not (TOOLS / 'gradle-8.11.1').exists():
        with zipfile.ZipFile(gradle) as archive:
            archive.extractall(TOOLS)
        (TOOLS / 'gradle-8.11.1/bin/gradle').chmod(0o755)
    sdk = TOOLS / 'android-sdk'
    packages = [
        ('platform-35_r02.zip', '0bb560a90a7a2cbd0dd8348224d518b638fe7949', 'platforms/android-35'),
        ('build-tools_r35_macosx.zip', '93ab8ce91230e067b5add4bfa79919c52b27f072', 'build-tools/35.0.0'),
        ('platform-tools_r37.0.1-darwin.zip', '6ae73f4de6452dc57e62ec02b68eed92a4c21661', 'platform-tools'),
    ]
    for name, sha, destination in packages:
        target = sdk / destination
        if target.exists():
            continue
        source = download('https://dl.google.com/android/repository/' + name, TOOLS / 'downloads' / name, sha, 'sha1')
        stage = TOOLS / 'sdk-extract'
        stage.mkdir(exist_ok=True)
        with zipfile.ZipFile(source) as archive:
            archive.extractall(stage)
            for item in archive.infolist():
                mode = item.external_attr >> 16
                if mode & 0o111:
                    (stage / item.filename).chmod(mode & 0o777)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(next(stage.iterdir())), str(target))
        shutil.rmtree(stage)
    (ROOT / 'local.properties').write_text('sdk.dir=' + str(sdk) + '\n')
    print('Toolchain ready. Run npm run build:android.')

if __name__ == '__main__':
    main()
