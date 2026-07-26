import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'Crack_Linebreak_Optimizer.user.js'), 'utf8');

function createHarness({ appleTouch = false } = {}) {
  const guards = new Map();
  let sends = 0;

  class MockElement {}
  const button = new MockElement();
  Object.assign(button, {
    matches: selector => selector === 'button[type="submit"]' || false,
    getAttribute: name => name === 'aria-label' ? '전송' : null,
    textContent: '',
    querySelector: selector => selector === 'svg' ? {} : null,
    getBoundingClientRect: () => ({ left: 370, right: 405, top: 120, bottom: 155, width: 35, height: 35 }),
    click: () => { sends += 1; },
  });

  const rootElement = { querySelectorAll: selector => selector.includes('button') ? [button] : [] };
  const input = new MockElement();
  Object.assign(input, {
    dataset: {},
    parentElement: rootElement,
    closest: selector => {
      if (selector.includes('textarea')) return input;
      if (selector === 'form') return rootElement;
      if (selector === '.bg-surface_tertiary') return null;
      if (selector === 'div.flex.flex-col') return { innerText: '' };
      return null;
    },
    getBoundingClientRect: () => ({ left: 10, right: 410, top: 100, bottom: 180, width: 400, height: 80 }),
  });

  const document = {
    documentElement: {},
    head: { appendChild: () => {} },
    getElementById: () => null,
    createElement: () => ({ id: '', textContent: '' }),
    addEventListener: () => {},
  };
  const window = {
    addEventListener(type, handler, capture) {
      assert.equal(capture, true, `${type} guard must use capture phase`);
      guards.set(type, handler);
    },
  };

  vm.runInNewContext(source, {
    console,
    document,
    window,
    navigator: {
      userAgent: appleTouch ? 'iPad' : 'Windows',
      platform: appleTouch ? 'MacIntel' : 'Win32',
      maxTouchPoints: appleTouch ? 5 : 0,
    },
    HTMLElement: MockElement,
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
    GM_addStyle: () => {},
    GM: { addStyle: () => {} },
  });

  assert.deepEqual([...guards.keys()], ['keydown', 'keypress', 'keyup']);

  function dispatch(type, init = {}) {
    let defaultPrevented = false;
    let propagationStopped = false;
    guards.get(type)({
      type,
      key: 'Enter',
      keyCode: 13,
      target: input,
      isComposing: false,
      repeat: false,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      preventDefault: () => { defaultPrevented = true; },
      stopImmediatePropagation: () => { propagationStopped = true; },
      ...init,
    });
    return { defaultPrevented, propagationStopped };
  }

  return { dispatch, sends: () => sends };
}

assert.match(source, /@run-at\s+document-start/);
assert.match(source, /@version\s+1\.4\.1/);

{
  const desktop = createHarness();
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const plain = desktop.dispatch(type);
    assert.equal(plain.propagationStopped, true, `desktop ${type} Enter must not reach Crack`);
    assert.equal(plain.defaultPrevented, false, `desktop ${type} Enter must retain the newline default`);
  }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    const shortcut = desktop.dispatch(type, { ctrlKey: true });
    assert.equal(shortcut.propagationStopped, true);
    assert.equal(shortcut.defaultPrevented, true);
  }
  assert.equal(desktop.sends(), 1, 'Ctrl+Enter must send exactly once on keydown');
}

{
  const ipad = createHarness({ appleTouch: true });
  const plain = ipad.dispatch('keydown');
  assert.equal(plain.propagationStopped, false, 'iPhone/iPad Enter must keep the native editor behavior');
  assert.equal(plain.defaultPrevented, false);

  for (const type of ['keydown', 'keypress', 'keyup']) {
    const shortcut = ipad.dispatch(type, { metaKey: true });
    assert.equal(shortcut.propagationStopped, true);
    assert.equal(shortcut.defaultPrevented, true);
  }
  assert.equal(ipad.sends(), 1, 'Command+Enter must send exactly once on keydown');
}

console.log('Linebreak optimizer keyboard contracts passed.');
