#!/usr/bin/env python3
"""Explicit-device Gate 0 smoke; no device reset, root, secrets or production data."""
import argparse
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--serial', required=True, help='Exact adb device serial; never auto-select')
parser.add_argument('--apk', type=Path, help='Optional test APK to install/update without clearing data')
parser.add_argument('--pages', type=int, default=3, choices=range(1, 21))
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
out = root / 'artifacts' / 'android-smoke'
out.mkdir(parents=True, exist_ok=True)
adb = str(Path(os.environ.get('ANDROID_HOME', '/workspace/.android-sdk')) / 'platform-tools/adb')
package = 'dev.mobileairp.gate0'


def command(*parts, binary=False, timeout=120):
    result = subprocess.run([adb, '-s', args.serial, *parts], capture_output=True, check=True, timeout=timeout)
    return result.stdout if binary else result.stdout.decode('utf-8', errors='replace').strip()


def layout():
    command('shell', 'uiautomator', 'dump', '/sdcard/gate0-ui.xml', timeout=45)
    return ET.fromstring(command('exec-out', 'cat', '/sdcard/gate0-ui.xml'))


def find(pattern, attempts=12):
    for _ in range(attempts):
        tree = layout()
        for node in tree.iter('node'):
            label = node.get('text', '') + ' ' + node.get('content-desc', '')
            if re.search(pattern, label):
                bounds = list(map(int, re.findall(r'\d+', node.get('bounds', ''))))
                if len(bounds) == 4 and bounds[2] > bounds[0] and bounds[3] > bounds[1]:
                    return node, bounds
        time.sleep(1)
    raise RuntimeError('Expected Gate 0 UI did not appear: ' + pattern)


def tap(pattern):
    _, b = find(pattern)
    command('shell', 'input', 'tap', str((b[0] + b[2]) // 2), str((b[1] + b[3]) // 2))


def capture(name):
    (out / name).write_bytes(command('exec-out', 'screencap', '-p', binary=True))


def launch():
    command('shell', 'am', 'force-stop', package)
    result = command('shell', 'am', 'start', '-W', '-n', package + '/.MainActivity')
    if report.get('versionCode', 0) >= 4:
        command('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW',
                '-d', 'mobile-ai-rp://lab', package)
    return result


mock = None
reverse_owned = False
report = {'probe': 'gate0-adb-smoke-v1', 'serial': args.serial, 'status': 'failed'}
try:
    if command('shell', 'getprop', 'sys.boot_completed') != '1':
        raise RuntimeError('Android has not completed boot; no app test was performed')
    report['device'] = {name: command('shell', 'getprop', prop) for name, prop in {
        'model': 'ro.product.model', 'android': 'ro.build.version.release',
        'api': 'ro.build.version.sdk', 'abi': 'ro.product.cpu.abi', 'emulator': 'ro.kernel.qemu',
    }.items()}
    if args.apk:
        if not args.apk.is_file():
            raise RuntimeError('APK does not exist')
        command('install', '-r', str(args.apk))
        report['apk_sha256'] = hashlib.sha256(args.apk.read_bytes()).hexdigest()
    installed = command('shell', 'dumpsys', 'package', package)
    version = re.search(r'versionCode=(\d+)', installed)
    if version is None or int(version.group(1)) < 2:
        raise RuntimeError('Install the code2 or newer Gate 0 APK before running this smoke')
    report['versionCode'] = int(version.group(1))
    report['launch'] = launch()
    find('就绪')
    capture('01-launch.png')
    tap('准备 1000 条合成消息')
    find('已加载 50 条', attempts=30)
    for page in range(2, args.pages + 1):
        tap('加载更早的 50 条')
        find(f'已加载 {50 * page} 条')
    report['visibleRowsAfterPaging'] = 50 * args.pages
    capture('02-paging.png')
    # Restart the process, preserving its database; the first page must still exist.
    launch()
    find('已加载 50 条', attempts=30)
    report['persistedAfterForceStop'] = True
    capture('03-reopened.png')

    existing = command('reverse', '--list')
    if 'tcp:8787' in existing:
        raise RuntimeError('Existing port 8787 reverse mapping preserved; remove it deliberately before this runner')
    log = (out / 'mock.log').open('w')
    mock = subprocess.Popen(['node', str(root / 'scripts/mock-sse-server.mjs')],
                            cwd=root, stdout=log, stderr=log, env={**os.environ, 'MOCK_PORT': '8787'})
    ready = False
    for _ in range(40):
        if mock.poll() is not None:
            raise RuntimeError('Owned mock server could not start; existing processes were not stopped')
        try:
            connection = http.client.HTTPConnection('127.0.0.1', 8787, timeout=1)
            connection.request('GET', '/health')
            response = connection.getresponse()
            ready = response.status == 200 and json.loads(response.read())['fixture'] == 'synthetic-only'
            connection.close()
            if ready and 'Synthetic SSE server listening' in (out / 'mock.log').read_text():
                break
            ready = False
        except (OSError, ValueError, KeyError):
            pass
        time.sleep(0.1)
    if not ready:
        raise RuntimeError('Mock readiness failed')
    command('reverse', 'tcp:8787', 'tcp:8787')
    reverse_owned = True
    tap('打开网络与卡片验证')
    for _ in range(5):
        try:
            find('运行 ADB 网络验收', attempts=1)
            break
        except RuntimeError:
            command('shell', 'input', 'swipe', '160', '520', '160', '160', '350')
    tap('运行 ADB 网络验收')
    # Scroll reports into view on small displays; the button remains a separate explicit action.
    command('shell', 'input', 'swipe', '160', '520', '160', '160', '350')
    node, _ = find('"probe": "gate0-adb-network-v1"', attempts=30)
    network = json.loads(node.get('text', ''))
    if not all(network.get(key) is True for key in ('completed', 'cancelledAfterFirstDelta', 'recovered')):
        raise RuntimeError('Native network acceptance reported a failure')
    report['nativeNetwork'] = network
    capture('04-network.png')
    report['status'] = 'passed'
    report['limits'] = 'Synthetic smoke only; no physical-device performance, weak network or card selection claim'
finally:
    cleanup_errors = []
    if reverse_owned:
        try:
            command('reverse', '--remove', 'tcp:8787')
        except (subprocess.SubprocessError, OSError):
            cleanup_errors.append('adb_reverse_remove_failed')
    if mock is not None:
        mock.terminate()
        try:
            mock.wait(timeout=10)
        except subprocess.TimeoutExpired:
            mock.kill()
            mock.wait(timeout=10)
    if cleanup_errors:
        report['cleanupErrors'] = cleanup_errors
        report['status'] = 'failed'
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False, indent=2))
if report['status'] != 'passed':
    raise SystemExit(1)
