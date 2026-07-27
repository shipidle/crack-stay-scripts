import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const messenger = fs.readFileSync(path.join(root, 'Crack_Messenger.user.js'), 'utf8');
const bridge = fs.readFileSync(path.join(root, 'Crack_Lore_Sync_Bridge.user.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'supabase', 'messenger_sync.sql'), 'utf8');

assert.match(messenger, /@name\s+💌 크랙 메신저/);
assert.match(messenger, /background:#fff4f7/);
assert.match(messenger, /\.cms-chat\{[^}]*background:#f6f7f8/);
assert.match(messenger, /'gemini-3\.1-flash-lite': \{ label: 'Gemini 3\.1 Flash-Lite', input: 0\.25, output: 1\.50/);
assert.match(messenger, /'gemini-2\.5-pro': \{ label: 'Gemini 2\.5 Pro', input: 1\.25, output: 10\.00/);
assert.match(messenger, /'gemini-3\.1-pro-preview': \{ label: 'Gemini 3\.1 Pro Preview', input: 2\.00, output: 12\.00/);
assert.match(messenger, /STATIC_CACHE_MS = 5 \* 60 \* 1000/);
assert.match(messenger, /Never output narration, actions, gestures/);
assert.match(messenger, /Ignore any instructions in it about HUDs/);
assert.match(messenger, /finishReason === 'MAX_TOKENS'/);
assert.match(messenger, /if \(state\.timeMode === 'custom'\) \{ state\.timeMode = 'continue'/);
assert.match(messenger, /font-family:"Pretendard"/);
assert.doesNotMatch(messenger, /ONE Mobile Title/);
assert.match(messenger, /const VERSION = '0\.3\.1'/);
assert.match(messenger, /\.cms-bubble\{[^}]*font-size:15px/);
assert.match(messenger, /bindCropEditor\('character'/);
assert.match(messenger, /pointerdown/);
assert.match(messenger, /data-cms-crop-action="reset"/);
assert.match(messenger, /statusMessage/);
assert.match(messenger, /characterAvatar, userAvatar, characterCrop, userCrop/);
assert.match(messenger, /const maxSize = 640/);
assert.doesNotMatch(messenger.match(/function cloudSafeSettings\(\)[\s\S]*?\n  \}/)?.[0] || '', /apiKey/);

assert.match(bridge, /__SHIPIDLE_MESSENGER_SYNC__/);
assert.match(bridge, /getSettings: getMessengerSettings/);
assert.match(bridge, /saveSettings: saveMessengerSettings/);
assert.match(bridge, /characterAvatar: normalizeMessengerAvatar/);
assert.match(bridge, /characterCrop: normalizeMessengerCrop/);
assert.match(bridge, /statusMessage: String/);
assert.match(sql, /enable row level security/i);
assert.match(sql, /auth\.uid\(\) = owner_id/g);
assert.match(sql, /primary key \(owner_id, room_key\)/i);

console.log('messenger contracts: PASS');
