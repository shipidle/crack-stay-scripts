import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'install-center.config.json'), 'utf8'));
const install = fs.readFileSync(path.join(root, 'INSTALL.md'), 'utf8');
const files = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.user.js'))
  .map(entry => entry.name);

assert.equal(files.length, 12, '현재 활성 userscript 수가 예상과 다름');
assert.doesNotMatch(install, /raw\.githubusercontent\.com\/[^\s)]+\/archive\//, '설치 링크에 archive 경로가 들어가면 안 됨');

for (const channel of config.channels) {
  for (const device of config.devices) {
    const marker = `<a id="${channel.id}-${device.id}"></a>`;
    const start = install.indexOf(marker);
    assert.notEqual(start, -1, `${channel.id}/${device.id} 구역이 없음`);
    const next = install.indexOf('<a id="', start + marker.length);
    const section = install.slice(start, next < 0 ? install.length : next);
    const excluded = new Set(device.exclude);
    const selected = files.filter(file => !excluded.has(file));
    assert.match(section, new RegExp(`총 ${selected.length}개`));
    for (const file of files) {
      const url = `https://raw.githubusercontent.com/${config.repository}/${channel.branch}/${file}`;
      if (excluded.has(file)) assert.ok(!section.includes(url), `${channel.id}/${device.id}에서 ${file} 제외 실패`);
      else assert.ok(section.includes(url), `${channel.id}/${device.id}에 ${file} 링크 누락`);
    }
  }
}

console.log('Install center device/channel checks passed.');
