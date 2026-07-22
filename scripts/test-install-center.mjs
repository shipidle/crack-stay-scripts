import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'install-center.config.json'), 'utf8'));
const install = fs.readFileSync(path.join(root, 'INSTALL.md'), 'utf8');
const files = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.user.js'))
  .map(entry => entry.name);
const waveIcon = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E';
const graphemeSegmenter = new Intl.Segmenter('ko', { granularity: 'grapheme' });

assert.ok(files.length > 0, '활성 userscript가 없음');
assert.doesNotMatch(install, /raw\.githubusercontent\.com\/[^\s)]+\/archive\//, '설치 링크에 archive 경로가 들어가면 안 됨');

for (const file of files) {
  assert.match(file, /^Crack_[A-Za-z0-9_]+\.user\.js$/, `${file}: 파일명은 Crack_*.user.js 형식이어야 함`);
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const name = source.match(/^\/\/ @name\s+(.+)$/m)?.[1]?.trim() || '';
  const icon = source.match(/^\/\/ @icon\s+(.+)$/m)?.[1]?.trim() || '';
  const graphemes = [...graphemeSegmenter.segment(name)].map(item => item.segment);
  assert.match(graphemes[0] || '', /\p{Emoji}/u, `${file}: @name은 이모지로 시작해야 함`);
  assert.equal(graphemes[1], ' ', `${file}: @name 이모지 뒤에 공백이 필요함`);
  assert.doesNotMatch(graphemes[2] || '', /\p{Emoji}/u, `${file}: @name 앞 이모지는 하나만 사용해야 함`);
  assert.equal(icon, waveIcon, `${file}: @icon은 🌊 아이콘이어야 함`);
}

for (const channel of config.channels) {
  for (const device of config.devices) {
    const marker = `<a id="${channel.id}-${device.id}"></a>`;
    const start = install.indexOf(marker);
    assert.notEqual(start, -1, `${channel.id}/${device.id} 구역이 없음`);
    const next = install.indexOf('<a id="', start + marker.length);
    const section = install.slice(start, next < 0 ? install.length : next);
    const excluded = new Set([
      ...device.exclude,
      ...(config.channelExcludes?.[channel.id] || [])
    ]);
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
