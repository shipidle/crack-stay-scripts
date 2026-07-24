import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const configPath = path.join(root, 'install-center.config.json');
const outputPath = path.join(root, 'INSTALL.md');
const checkOnly = process.argv.includes('--check');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

function activeUserscripts() {
  const order = new Map(config.order.map((name, index) => [name, index]));
  return fs.readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.user.js'))
    .map(entry => entry.name)
    .sort((left, right) => {
      const leftOrder = order.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = order.get(right) ?? Number.MAX_SAFE_INTEGER;
      return leftOrder - rightOrder || left.localeCompare(right, 'en');
    });
}

function scriptLabel(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  return source.match(/^\/\/ @name\s+(.+)$/m)?.[1]?.trim() || file;
}

function channelFile(channel, file) {
  return config.channelFileAliases?.[channel.id]?.[file] || file;
}

function rawUrl(channel, file) {
  return `https://raw.githubusercontent.com/${config.repository}/${channel.branch}/${encodeURIComponent(channelFile(channel, file))}`;
}

function section(channel, device, files) {
  const excluded = new Set([
    ...device.exclude,
    ...(config.channelExcludes?.[channel.id] || [])
  ]);
  const selected = files.filter(file => !excluded.has(file));
  const heading = `${channel.label} · ${device.label}`;
  const rows = selected.map((file, index) => {
    const label = scriptLabel(file);
    const targetFile = channelFile(channel, file);
    return `${index + 1}. [${label} 설치/덮어쓰기](${rawUrl(channel, file)}) — \`${targetFile}\``;
  }).join('\n');
  return `<a id="${channel.id}-${device.id}"></a>\n\n## ${heading}\n\n${channel.description} · 총 ${selected.length}개\n\n${rows}`;
}

const files = activeUserscripts();
for (const device of config.devices) {
  for (const file of device.exclude) {
    if (!files.includes(file)) throw new Error(`${device.id} 제외 파일이 루트에 없음: ${file}`);
  }
}
for (const channel of config.channels) {
  for (const file of config.channelExcludes?.[channel.id] || []) {
    if (!files.includes(file)) throw new Error(`${channel.id} 채널 제외 파일이 루트에 없음: ${file}`);
  }
}

const contents = `# 📦 Crack 스크립트 설치센터

이 페이지만 즐겨찾기하면 됨. **평소 업데이트는 Stay에서 하고**, 여기서는 최초 설치·기기 추가·main/beta 전환만 함.

> 현재 사용 채널이 헷갈리면: Stay에서 스크립트 설명의 \`🧪 BETA\` 표시를 확인하면 됨. 표시가 없으면 MAIN임.

## 사용법

1. 아래에서 **채널과 기기**가 맞는 제목을 찾음.
2. 그 구역의 링크를 위에서부터 한 번씩 열어 Stay에 저장함.
3. 기존에 같은 스크립트가 있으면 삭제하지 말고 그대로 덮어씀.
4. 설치가 끝나면 Stay에서 각 스크립트의 업데이트 스위치를 켬.

- **BETA:** 최신 수정본. 평소 네가 사용할 채널.
- **MAIN:** 테스트 완료 후 Merge된 안정판. beta 문제 발생 시 롤백용.
- \`archive/\` 폴더는 모든 목록에서 제외됨.
- 새 루트 \`.user.js\`는 기본적으로 모든 기기 목록에 자동 포함됨.

## 빠른 이동

${config.channels.flatMap(channel => config.devices.map(device => `- [${channel.label} · ${device.label}](#${channel.id}-${device.id})`)).join('\n')}

${config.channels.flatMap(channel => config.devices.map(device => section(channel, device, files))).join('\n\n---\n\n')}

---

## 별도 1회 설정

- BETA의 기기 간 요약 턴 동기화는 [Supabase SQL](https://github.com/${config.repository}/blob/beta/supabase/summary_sync.sql)을 같은 Supabase 프로젝트에서 1회 실행해야 함.
- BETA의 로어 저용량 동기화와 현재본·이전본 보관은 [Lore Sync v2 SQL](https://github.com/${config.repository}/blob/beta/supabase/lore_sync_v2.sql)을 같은 Supabase 프로젝트에서 1회 실행해야 함.

<!-- 이 파일은 scripts/generate-install-center.mjs로 생성됨. 직접 수정하지 말고 install-center.config.json을 수정할 것. -->
`;

if (checkOnly) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== contents) {
    console.error('INSTALL.md가 현재 스크립트/설정과 다름. node scripts/generate-install-center.mjs 실행 필요.');
    process.exit(1);
  }
  console.log(`Install center is current: ${files.length} active userscripts.`);
} else {
  fs.writeFileSync(outputPath, contents, 'utf8');
  console.log(`Generated INSTALL.md from ${files.length} active userscripts.`);
}
