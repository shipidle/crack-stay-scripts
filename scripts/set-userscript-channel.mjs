import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'install-center.config.json'), 'utf8'));
const channelId = process.argv[process.argv.indexOf('--channel') + 1];
const checkOnly = process.argv.includes('--check');
const channel = config.channels.find(item => item.id === channelId);
if (!channel) throw new Error('사용법: node scripts/set-userscript-channel.mjs --channel main|beta [--check]');

const files = fs.readdirSync(root, { withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.user.js'))
  .map(entry => entry.name)
  .sort();
let changed = 0;

for (const file of files) {
  const filePath = path.join(root, file);
  const original = fs.readFileSync(filePath, 'utf8');
  const url = `https://raw.githubusercontent.com/${config.repository}/${channel.branch}/${file}`;
  let next = original
    .replace(/^\/\/ @updateURL\s+.*$/m, `// @updateURL    ${url}`)
    .replace(/^\/\/ @downloadURL\s+.*$/m, `// @downloadURL  ${url}`);

  if (!/^\/\/ @updateURL\s+/m.test(original) || !/^\/\/ @downloadURL\s+/m.test(original)) {
    throw new Error(`${file}: @updateURL 또는 @downloadURL이 없음`);
  }
  if (!/^\/\/ @description\s+/m.test(original)) throw new Error(`${file}: @description이 없음`);

  next = next.replace(/^\/\/ @description\s+(?:🧪 BETA · )?/m, match => {
    const clean = match.replace('🧪 BETA · ', '');
    return channel.id === 'beta' ? clean.replace(/^\/\/ @description\s+/, '$&🧪 BETA · ') : clean;
  });

  if (next !== original) {
    changed += 1;
    if (!checkOnly) fs.writeFileSync(filePath, next, 'utf8');
  }
}

if (checkOnly && changed > 0) {
  console.error(`${changed}개 userscript가 ${channel.id} 채널 메타데이터와 다름.`);
  process.exit(1);
}
console.log(checkOnly
  ? `${channel.id} channel metadata is current for ${files.length} userscripts.`
  : `Updated ${changed}/${files.length} userscripts for ${channel.id}.`);
