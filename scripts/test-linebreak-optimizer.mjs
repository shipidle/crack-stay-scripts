import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'Crack_Linebreak_Optimizer.user.js'), 'utf8');

function createHarness({ appleTouch = false } = {}) {
  const guards = new Map();
  let sends = 0;
  let pageGuardSource = '';

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
    documentElement: {
      dataset: {},
      appendChild: node => { pageGuardSource = node.textContent; },
    },
    head: { appendChild: () => {} },
    getElementById: () => null,
    querySelector: () => null,
    createElement: () => ({ id: '', textContent: '', remove: () => {} }),
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
      code: 'Enter',
      keyCode: 13,
      which: 13,
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

  return { dispatch, pageGuardSource: () => pageGuardSource, sends: () => sends };
}

assert.match(source, /@run-at\s+document-start/);
assert.match(source, /@version\s+1\.5\.0/);
assert.match(source, /crackEnterGuardPage/);
assert.match(source, /new KeyboardEvent\('keydown'/);
assert.match(source, /shiftKey:\s*true/);

{
  const injected = createHarness().pageGuardSource();
  assert.ok(injected.includes('crackEnterGuardPage'), 'page-world guard must be injected');
  new vm.Script(injected);

  const pageGuards = new Map();
  const syntheticEvents = [];
  let insertedLineBreaks = 0;
  let pageSends = 0;
  const sendButton = {
    matches: selector => selector === 'button[type="submit"]:not(:disabled)',
    getAttribute: () => null,
    textContent: '',
    click: () => { pageSends += 1; },
  };
  const form = { querySelectorAll: () => [sendButton] };
  const pageInput = {
    dataset: {},
    parentElement: null,
    closest: selector => {
      if (selector.includes('textarea')) return pageInput;
      if (selector === 'form') return form;
      return null;
    },
    dispatchEvent: event => { syntheticEvents.push(event); return true; },
  };
  const pageWindow = {
    addEventListener: (type, handler) => pageGuards.set(type, handler),
  };
  class MockKeyboardEvent {
    constructor(type, init) { Object.assign(this, init, { type }); }
  }
  vm.runInNewContext(injected, {
    window: pageWindow,
    document: {
      documentElement: { dataset: {} },
      execCommand: command => {
        assert.equal(command, 'insertLineBreak');
        insertedLineBreaks += 1;
      },
    },
    navigator: { userAgent: 'Windows', platform: 'Win32', maxTouchPoints: 0 },
    KeyboardEvent: MockKeyboardEvent,
  });

  function dispatchPage(init = {}) {
    let defaultPrevented = false;
    let propagationStopped = false;
    pageGuards.get('keydown')({
      type: 'keydown',
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      target: pageInput,
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

  const plain = dispatchPage();
  assert.equal(plain.defaultPrevented, true, 'page-world Enter default must be replaced');
  assert.equal(plain.propagationStopped, true, 'page-world Enter must not reach Crack');
  assert.equal(syntheticEvents.length, 1);
  assert.equal(syntheticEvents[0].shiftKey, true, 'page-world Enter must become Shift+Enter');
  assert.equal(insertedLineBreaks, 1, 'unhandled synthetic Shift+Enter must insert a line break');

  const shortcut = dispatchPage({ ctrlKey: true });
  assert.equal(shortcut.defaultPrevented, true);
  assert.equal(shortcut.propagationStopped, true);
  assert.equal(pageSends, 1, 'page-world Ctrl+Enter must send once');
}

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

  const imeEnter = desktop.dispatch('keydown', {
    key: 'Process',
    code: 'Enter',
    keyCode: 229,
    which: 229,
    isComposing: true,
  });
  assert.equal(imeEnter.propagationStopped, true, 'IME Enter must not reach Crack send handlers');
  assert.equal(imeEnter.defaultPrevented, false, 'IME Enter must still commit composition');
  assert.equal(desktop.sends(), 1, 'IME Enter must not send');
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
