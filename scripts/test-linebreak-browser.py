"""Offline keyboard test: a local fixture only; no chat/API/network request."""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

source = (Path(__file__).resolve().parents[1] / 'Crack_Linebreak_Optimizer.user.js').read_text(encoding='utf-8')
with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path=os.environ.get('CHROMIUM_PATH'))
    page = browser.new_page()
    page.set_content('''<div><div class="__chat_input_textarea tiptap" contenteditable="true"></div>
      <button type="button" id="other">Other</button><button id="send"><svg></svg></button></div>''')
    page.evaluate('''() => {
      window.sends=0; window.others=0;
      send.onclick=()=>sends++;
      other.onclick=()=>others++;
      window.GM_addStyle=()=>{};
    }''')
    page.evaluate(source)
    editor=page.locator('.__chat_input_textarea')
    editor.fill('first')
    editor.press('Enter')
    page.keyboard.insert_text('second')
    assert page.evaluate('sends') == 0
    assert '\n' in editor.inner_text(), repr(editor.inner_text())
    editor.press('Control+Enter')
    assert page.evaluate('sends') == 1
    assert page.evaluate('others') == 0
    page.locator('#send').evaluate('(el)=>el.disabled=true')
    editor.press('Control+Enter')
    assert page.evaluate('sends') == 1
    assert page.evaluate('others') == 0
    browser.close()
print('PASS: Enter newline; Ctrl+Enter sends once; default submit type; disabled and unrelated buttons untouched.')
