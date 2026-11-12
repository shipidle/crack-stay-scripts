// ==UserScript==
// @name         🔘 채팅모델 원형 아이콘
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.0.0
// @description  🧪 BETA · 입력창의 채팅모델 버튼을 현재 모델 아이콘만 보이는 원형으로 표시합니다.
// @match        *://crack.wrtn.ai/*
// @grant        none
// @icon         data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%3E%3Ctext%20x=%220%22%20y=%2252%22%20font-size=%2252%22%3E%F0%9F%8C%8A%3C/text%3E%3C/svg%3E
// @author       shipidle
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Model_Icon.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/beta/Crack_Model_Icon.user.js
// ==/UserScript==

(function () {
    'use strict';
    const ID = 'crack-model-icon-style';
    if (document.getElementById(ID)) return;
    const MARK = 'data-crack-model-circle';
    const ICON = 'img[src*="model-icon"]';
    const INPUT = 'textarea[placeholder*="메시지"], textarea[aria-label*="메시지"], div.__chat_input_textarea, div[contenteditable="true"].tiptap, .ProseMirror[contenteditable="true"], [role="textbox"][contenteditable="true"]';
    const EXCLUDE = '[role="dialog"], [role="menu"], [role="listbox"], [aria-modal="true"]';
    const style = document.createElement('style');
    style.id = ID;
    style.textContent = `
        button[${MARK}] {
            position: relative !important;
            box-sizing: border-box !important;
            width: 28px !important; min-width: 28px !important; max-width: 28px !important;
            height: 28px !important; min-height: 28px !important; max-height: 28px !important;
            flex: 0 0 28px !important; padding: 0 !important; gap: 0 !important;
            border-radius: 50% !important; overflow: hidden !important;
            font-size: 0 !important; color: transparent !important;
        }
        button[${MARK}] * {
            font-size: 0 !important; color: transparent !important;
            position: static !important; transform: none !important;
            visibility: hidden !important;
        }
        button[${MARK}] ${ICON} {
            display: block !important; visibility: visible !important;
            position: absolute !important; left: 50% !important; top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 20px !important; height: 20px !important;
            min-width: 20px !important; max-width: 20px !important;
            min-height: 20px !important; max-height: 20px !important;
            margin: 0 !important; padding: 0 !important; object-fit: contain !important;
        }
        button[${MARK}]::before, button[${MARK}]::after { display: none !important; }
    `;
    document.head.appendChild(style);
    const marked = new Map();

    function update() {
        const targets = new Set();
        for (const input of document.querySelectorAll(INPUT)) {
            if (input.closest(EXCLUDE)) continue;
            // Stop at the nearest composer ancestor containing an official model trigger.
            let root = input.parentElement;
            for (let depth = 0; root && root !== document.body && depth < 8; depth++, root = root.parentElement) {
                const buttons = [...root.querySelectorAll('button[aria-haspopup]')].filter(button =>
                    !button.closest(EXCLUDE) && button.querySelector(ICON));
                if (!buttons.length) continue;
                buttons.forEach(button => targets.add(button));
                break;
            }
        }
        for (const [button, original] of marked) {
            if (targets.has(button)) continue;
            button.removeAttribute(MARK);
            if (original === null) button.removeAttribute('aria-label');
            else button.setAttribute('aria-label', original);
            marked.delete(button);
        }
        for (const button of targets) {
            if (!marked.has(button)) {
                marked.set(button, button.getAttribute('aria-label'));
                button.setAttribute(MARK, '');
            }
            // Preserve a spoken model name even though its visible label is hidden.
            if (marked.get(button) === null) {
                const name = button.textContent.trim() || button.querySelector(ICON)?.alt || '채팅모델 선택';
                if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
            }
        }
    }
    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => { pending = false; update(); });
    });
    observer.observe(document.body, {
        childList: true, subtree: true, characterData: true,
        attributes: true, attributeFilter: ['src', 'alt', 'aria-haspopup']
    });
    update();
})();
