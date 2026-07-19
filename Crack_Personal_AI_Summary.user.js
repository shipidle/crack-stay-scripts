// ==UserScript==
// @name         크랙 개인 요약 메모리 편집 & AI 자동 요약 추가
// @namespace    https://github.com/shipidle/crack-stay-scripts
// @version      1.0.0
// @description  shipidle 개인용 장기기억 요약 메모리 생성 및 자동 추가
// @author       shipidle
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Personal_AI_Summary.user.js
// @downloadURL  https://raw.githubusercontent.com/shipidle/crack-stay-scripts/main/Crack_Personal_AI_Summary.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const API_BASE = 'https://crack-api.wrtn.ai/crack-gen/v3/chats';
    const TYPE_MAP = {
        '단기 기억': 'shortTerm'
    };

    const DEFAULT_PROMPT = `# 📔 장기기억 아카이브 요약 프롬프트

## 🎯 목적
채팅 로그를 분석하여 이후 서사가 어긋나지 않도록 **'사건 단위의 독립적 앵커'**를 생성하되, **인물 간의 감정선과 미묘한 상호작용의 질감(Texture)**을 보존한다.
생성된 요약문은 향후 AI가 인물 간의 관계 역학부터 소소한 추억까지 생생하고 섬세하게 기억하여, 이후의 롤플레잉을 보다 입체적으로 이끌어가는 참고 자료로 쓰일 예정이다.

---

## 🧩 출력 단위 및 분리 기준
- **단위**: 출력의 최소 단위는 ‘사건’이다.
- **분리 필수 조건**: 아래 중 하나라도 해당하면 반드시 **새로운 사건 슬롯**으로 분리하여 출력한다.
1. **장소 이동** (예: 복도 → 교실 / 교정 → 중앙 정원)
2. **시간대 변화** (예: 오전 → 오후 / 수업 시간 → 쉬는 시간)
3. **주요 인물 구성 변화** (예: 1:1 대화 중 제3자 난입)
- **장소 명시**: 동일한 시간 내 주제가 이어질 때 장소가 바뀌면 병합해서 작성하되 바뀐 장소를 반드시 명시한다.
- **소급 금지**: 나중에 발생한 일(대사, 결정, 물건 등장 등)을 앞선 사건 요약에 미리 포함하지 않는다.
-**성행위 예외**: 단, 성행위 상황은 예외이므로 분리하지 않고 반드시 하나의 사건 슬롯으로 묶는다.
-**슬롯 수**: 가능한 2-3슬롯 내로 한 슬롯당 내용이 300자가 되게 작성한다.

---

## 📋 출력 형식 (강제)

[제목]
- 내용

### 1. 제목 규칙 (최고 중요도: 시맨틱 검색 최적화)
- **제한**: 공백 포함 **20자 이내 최대 활용**. 조사(~의, ~와, ~에서) 및 특수기호(# 등) 사용 금지.
- **형식 고정**: 유저명은 제외하고 관련된 **NPC명(필수)**을 포함하되, **세력명/국가명/소재/핵심행동** 등 검색에 유의미한 고유명사를 띄어쓰기로 나열. (날짜/시간 및 주관적 감정 기재 금지)
- 제목은 항상 []로 가둘 것. []는 20자 제한에 미포함, 대괄호[] 안의 내용 기준 공백 포함 20자 제한.
- **예시**:
- \`[NPC명 연회 독살시도 찻잔]\` (O)
- \`[NPC명 말다툼 사과 바닐라라떼]\` (O)
- \`[#NPC 말다툼 사과]\` (X - '#' 기호 사용 금지)
- \`[유저명 NPC명 말다툼 사과]\` (X - 기본값인 유저명 포함으로 글자수 낭비)

### 2. 내용 규칙
- **제한**: 공백 포함 **500자 이내**. **요약체(~함, ~임)**를 사용할 것.
- **형식**: 반드시 \`- \` (하이픈과 공백)으로 시작하되, 항목은 1개로 유지.
- **타임라인**: 본문 첫머리에 반드시 \`MM/DD 시간대\`를 명시할 것. (예: \`08/24 오후\`)
- **시간대**: 새벽 / 오전 / 오후 / 저녁 / 밤 중 택1.
- **대명사 금지**: '그', '그녀' 대신 반드시 **정확한 이름(유저명, NPC명 등)**을 명시하여 맥락 독립성을 확보할 것.
- **핵심 기록 요소**:
- **상호작용의 연쇄(Flow)**: 단순 '자극-반응'을 넘어, **[누군가의 행동/발화] → [상대의 리액션] → [그로 인한 재반응/변화]**의 인과 사슬을 명확히 기록할 것. **대사는 " " 인용**
- **사건의 배경 및 정보(Context & Lore)**: 단순 결과만 적지 말 것. '누가 무엇 때문에 공표했는지', '무슨 속셈으로 한 거짓말인지' 등 대화 중 언급된 **공식 발표, 전언, 소문, 은밀한 동기** 등 떡밥이 되는 맥락 정보를 구체적으로 포함할 것.
- **구체적 양상(How)**: '애교', '화냄' 등 추상적 표현 대신 **"옷자락을 당김", "미간을 찌푸림", "시선을 피함"** 등 로그에 명시된 행동과 표정을 적을 것.
- **미묘한 기류(Mood)**: 사건 전개에 필수적이지 않더라도, 두 인물 간의 **사소한 장난, 묘한 긴장감, 말투의 변화** 등 질감을 살리는 디테일을 포함할 것.
- **전환점 (Turning Point)**: **관계 변화** 및 **결정적 약속/은폐** 사실.
- **구체적 명사(Keywords)**: 상징적인 **선물, 물건, 공간**을 정확한 명칭으로 기록할 것.

---

## 🚫 기록 원칙 (Strict)
- **❌ 통합 금지**: 하루 전체를 하나로 요약하거나, 여러 사건을 대표 사건 하나로 뭉뚱그리지 말 것.
- **❌ 소설 금지**: AI의 주관적 해석, 의도 추론, 로그에 없는 사실 기록 금지. (동기는 오직 로그 안에서 확인된 것만 적을 것)
- **❌ 뭉개기 금지**: '대화를 나눴다'는 식의 결과적 요약 금지. **어떻게 시작되었고 그 대화가 어떻게 흘러갔는지(인과)**를 적을 것.
- **❌ 순서 변경 금지**: 반드시 입력 로그의 시간 흐름(Timeline)을 엄격히 준수할 것.
- **❌ 정보 이동 금지**: 특정 장소에서 일어난 대화나 물건을 다른 장소의 요약문에 섞지 말 것.
- **❌ 대괄표 남발 금지**: 제목 이외의 어떠한 내용에도 대괄호([,])를 사용하지 않는다.
- **⭕ 팩트의 확장 보존**: 물리적 사건뿐만 아니라, 인물 간 전달된 **간접 정보(미확인 소문, 제3자의 동향, 공표 내용 등)**도 스토리의 핵심 팩트로 간주하여 명확히 기록할 것.
- **⭕ 주체 보존**: 발단이 누구인지 구분하여, 상호작용의 방향성과 주체를 명확히 할 것.

---

## ⚠️ 오류 조건
- 서로 다른 장소의 사건이 하나로 합쳐질 경우 **출력 오류**.
- 제목 형식 미준수 또는 공백 포함 20자 초과 시 **출력 오류**.
- 내용이 공백 포함 500자를 초과하거나 로그의 순서가 뒤섞일 경우 **출력 오류**.
- 인물 간의 인과적 연쇄가 누락되면 **출력 오류**.
- 한국어 외의 언어로 출력시 **출력 오류**.`;

    function getChatId() {
        const m = location.pathname.match(/\/episodes\/([a-f0-9]+)/);
        return m ? m[1] : null;
    }

    function getToken() {
        const m = document.cookie.match(/(^| )access_token=([^;]+)/);
        return m ? m[2] : null;
    }

    function escapeHtml(s) {
        if (!s) return "";
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function apiCall(method, path, body) {
        const token = getToken(), chatId = getChatId();
        if (!token || !chatId) {
            alert('인증 정보 또는 채팅 ID를 찾을 수 없습니다.');
            return Promise.resolve(null);
        }
        const opts = {
            method,
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            }
        };
        if (body) opts.body = JSON.stringify(body);
        return fetch(API_BASE + '/' + chatId + path, opts)
            .then(function (r) {
                if (!r.ok) {
                    return r.text().then(function (t) {
                        console.error('API Error:', r.status, t);
                        return null;
                    });
                }
                return r.text().then(function (t) {
                    return t ? JSON.parse(t) : { result: 'SUCCESS' };
                });
            })
            .catch(function (e) {
                alert('네트워크 오류: ' + e.message);
                return null;
            });
    }

    // --- 무제한(0) 호출을 지원하는 최적화된 메시지 불러오기 로직 ---
    async function fetchRecentMessages(limit) {
        let allMessages = [];
        let currentCursor = null;
        let requestedLimit = parseInt(limit, 10);

        // 숫자가 아니면 기본값 15, 0이면 무제한으로 설정
        if (isNaN(requestedLimit)) requestedLimit = 15;
        const isUnlimited = requestedLimit === 0;

        while (true) {
            // 한 번에 가져올 개수는 최대 50개 (서버 효율을 위해 분할 요청)
            let fetchLimit = isUnlimited ? 50 : Math.min(requestedLimit - allMessages.length, 50);
            let path = '/messages?limit=' + fetchLimit;

            if (currentCursor) {
                path += '&cursor=' + encodeURIComponent(currentCursor);
            }

            let res = await apiCall('GET', path);

            // 더 이상 가져올 데이터가 없으면 중단
            if (!res || !res.data || !res.data.messages || res.data.messages.length === 0) {
                break;
            }

            allMessages = allMessages.concat(res.data.messages);

            // 제한이 걸려있고, 목표치에 도달했으면 중단
            if (!isUnlimited && allMessages.length >= requestedLimit) {
                break;
            }

            // 다음 페이지가 존재하면 커서를 갱신하고 계속 진행
            if (res.data.hasNext && res.data.nextCursor) {
                currentCursor = res.data.nextCursor;
            } else {
                break;
            }
        }

        // 제한이 설정된 경우 초과된 부분 정확히 자르기
        if (!isUnlimited) {
            allMessages = allMessages.slice(0, requestedLimit);
        }

        if (allMessages.length === 0) return null;

        // 과거 -> 최신 순으로 정렬하기 위해 배열 뒤집기
        let msgs = allMessages.reverse();
        let chatText = msgs.map(m => {
            let role = m.role === 'user' ? 'User' : 'Character';
            return `${role}: ${m.content}`;
        }).join('\n\n');

        return chatText;
    }

async function callGeminiApi(apiKey, model, chatLog, turns) {
        const currentPrompt = localStorage.getItem('shipidle_crack_summary_custom_prompt') || DEFAULT_PROMPT;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

        // 🔥 태업 방지용 강력 지시문 추가
        const reinforcedPrompt = `[초강력 지시사항]
제공된 대화는 총 ${turns}턴 분량입니다.
당신은 대화의 일부(예: 15턴)만 요약하고 출력을 중단해서는 절대 안 됩니다.
제공된 [채팅 내역]의 처음부터 끝까지 모든 흐름을 파악하고, 누락되는 사건 없이 전부 요약하세요. 분량이 길더라도 태업하지 말고 끝까지 요약본을 생성해야 합니다.

[채팅 내역 시작]
${chatLog}
[채팅 내역 끝]`;

        const payload = {
            system_instruction: { parts: [{ text: currentPrompt }] },
            contents: [{ role: "user", parts: [{ text: reinforcedPrompt }] }],
            generationConfig: {
                temperature: 0.2, // 딴짓 못하게 온도 낮춤
                topK: 40,
                topP: 0.8
            }
        };
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error?.message || 'Gemini API 에러');
        }
        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    // --- Firebase Vertex AI 파싱 및 호출 로직 ---
    function parseVertexContent(scriptStr) {
        try {
            const match = scriptStr.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\});/);
            if (match && match[1]) {
                return new Function("return " + match[1])();
            }
            if (scriptStr.includes("apiKey")) {
                const startText = "firebaseConfig = {";
                const startIndex = scriptStr.indexOf(startText);
                if (startIndex !== -1) {
                    const endIndex = scriptStr.indexOf("}", startIndex);
                    if (endIndex !== -1) {
                        const objStr = scriptStr.substring(startIndex + startText.length - 1, endIndex + 1);
                        return new Function("return " + objStr)();
                    }
                }
            }
        } catch(e) {}
        return null;
    }

async function callFirebaseApi(scriptStr, modelId, chatLog, turns) {
        const config = parseVertexContent(scriptStr);
        if (!config) {
            throw new Error("Firebase 스크립트 형식이 올바르지 않습니다. firebaseConfig = { ... }; 부분을 포함해주세요.");
        }
        const currentPrompt = localStorage.getItem('shipidle_crack_summary_custom_prompt') || DEFAULT_PROMPT;

        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js");
        const { getAI, getGenerativeModel, VertexAIBackend, HarmBlockThreshold, HarmCategory } = await import("https://www.gstatic.com/firebasejs/12.8.0/firebase-ai.js");

        let app;
        try {
            app = initializeApp(config, "shipidle-crack-summary-" + Date.now());
        } catch(e) {
            throw new Error("Firebase 초기화 실패: " + e.message);
        }

        const ai = getAI(app, { backend: new VertexAIBackend('global') });
        const safetySettings = [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF }
        ];

        const modelWithSys = getGenerativeModel(ai, {
            model: modelId,
            systemInstruction: currentPrompt,
            safetySettings,
            generationConfig: {
                temperature: 0.2,
                topK: 40,
                topP: 0.8
            }
        });

        // 🔥 태업 방지용 강력 지시문 추가
        const reinforcedPrompt = `[초강력 지시사항]
제공된 대화는 총 ${turns}턴 분량입니다.
당신은 대화의 일부(예: 15턴)만 요약하고 출력을 중단해서는 절대 안 됩니다.
제공된 [채팅 내역]의 처음부터 끝까지 모든 흐름을 파악하고, 누락되는 사건 없이 전부 요약하세요. 분량이 길더라도 태업하지 말고 끝까지 요약본을 생성해야 합니다.

[채팅 내역 시작]
${chatLog}
[채팅 내역 끝]`;

        const result = await modelWithSys.generateContent(reinforcedPrompt);
        const response = await result.response;
        return response.text();
    }

    function injectAiStyles() {
        if (document.getElementById('shipidle-crack-summary-ai-css')) return;
        const s = document.createElement('style');
        s.id = 'shipidle-crack-summary-ai-css';
        s.textContent = `
            .shipidle-crack-summary-ai-overlay { background:rgba(0,0,0,.5); z-index:100000; pointer-events:auto !important; }
            .shipidle-crack-summary-ai-modal { background:#fff !important; border-radius:16px; padding:28px; width:600px; max-width:90vw; max-height: 90vh; overflow-y: auto; box-shadow:0 8px 40px rgba(0,0,0,.2); pointer-events:auto !important; color:#222 !important; }
            .shipidle-crack-summary-ai-modal-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:20px; }
            .shipidle-crack-summary-ai-modal-header h3 { margin: 0; color:#222 !important; font-size: 17px; font-weight: 700; }
            .shipidle-crack-summary-ai-modal label { display:flex; font-size:13px; font-weight:600; margin-bottom:6px; color:#333 !important; align-items:center; justify-content:space-between;}
            .shipidle-crack-summary-ai-modal input, .shipidle-crack-summary-ai-modal textarea, .shipidle-crack-summary-ai-modal select { width:100%; padding:10px 12px; border:1px solid #ddd !important; border-radius:8px; font-size:14px; box-sizing:border-box; font-family:inherit; pointer-events:auto !important; background-color:#fff !important; color:#222 !important; }
            .shipidle-crack-summary-ai-modal input::placeholder, .shipidle-crack-summary-ai-modal textarea::placeholder { color:#999 !important; }
            .shipidle-crack-summary-ai-modal-btns { display:flex; gap:8px; justify-content:flex-end; margin-top:20px; }
            .shipidle-crack-summary-ai-mbtn { padding:10px 24px; border-radius:8px; border:1px solid #ddd !important; background:#fff !important; color:#222 !important; cursor:pointer; font-size:14px; font-weight:600; transition: background 0.2s;}
            .shipidle-crack-summary-ai-mbtn:hover { background: #f5f5f5 !important; }
            .shipidle-crack-summary-ai-mbtn-p { background:#222 !important; color:#fff !important; border-color:#222 !important; }
            .shipidle-crack-summary-ai-mbtn-p:hover { background:#444 !important; }
            .shipidle-crack-summary-ai-mbtn-p:disabled { background:#ccc !important; border-color:#ccc !important; color:#666 !important; cursor:not-allowed; }
            .crack-flex-ai-row { display:flex; gap:12px; margin-bottom: 16px; }
            .crack-flex-ai-row .fg { flex:1; }

            #shipidle-ai-summary-preview-container { margin-top: 12px; }
            #shipidle-ai-summary-card-nav { display:flex; align-items:center; justify-content:center; gap:12px; margin-bottom: 8px; font-size: 13px; font-weight: bold; }
            #shipidle-ai-summary-card-nav button { cursor:pointer; background:#f0f0f0; border:1px solid #ddd; border-radius:6px; padding:4px 10px; font-size:12px; transition: background 0.2s; color:#333; }
            #shipidle-ai-summary-card-nav button:hover { background:#e4e4e4; }

            .shipidle-crack-summary-session-card { background:#f9f9f9 !important; border:1px solid #eee !important; border-radius:8px; padding:12px; font-size:13px; }
            .shipidle-crack-summary-session-title { font-weight:bold; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; }
            .shipidle-crack-summary-session-content { color:#555 !important; line-height:1.4; white-space: pre-wrap; word-break: break-all; }
            .shipidle-crack-summary-char-count { font-size:11px; font-weight:normal; color: #777; }
            .shipidle-crack-summary-count-error { color: #e74c3c !important; font-weight:bold; }

            .shipidle-crack-summary-header-ai-btn { width:auto; height:32px; display:inline-flex; align-items:center; justify-content:center; gap:5px; border:1px solid #c5b9e7 !important; border-radius:8px; background:#e7e0fa !important; color:#4b3f68 !important; padding:0 10px; font-weight:650; font-size:12px; box-shadow:none; white-space:nowrap !important; cursor:pointer; transition:background 0.2s; }
            .shipidle-crack-summary-header-ai-btn:hover { background:#dcd2f5 !important; }

            body[data-theme="dark"] .shipidle-crack-summary-ai-modal { background: #242321 !important; color: #F0EFEB !important; }
            body[data-theme="dark"] .shipidle-crack-summary-ai-modal-header h3, body[data-theme="dark"] .shipidle-crack-summary-ai-modal label { color: #F0EFEB !important; }
            body[data-theme="dark"] .shipidle-crack-summary-ai-modal input, body[data-theme="dark"] .shipidle-crack-summary-ai-modal textarea, body[data-theme="dark"] .shipidle-crack-summary-ai-modal select { background: #141413 !important; color: #F0EFEB !important; border: 1px solid #42413D !important; }

            body[data-theme="dark"] #shipidle-ai-summary-card-nav button { background: #2E2D2B !important; color: #F0EFEB !important; border: 1px solid #42413D !important; }
            body[data-theme="dark"] #shipidle-ai-summary-card-nav button:hover { background: #42413D !important; }

            body[data-theme="dark"] .shipidle-crack-summary-session-card { background: #1a1918 !important; border: 1px solid #42413D !important; }
            body[data-theme="dark"] .shipidle-crack-summary-session-content { color: #ccc !important; }
            body[data-theme="dark"] .shipidle-crack-summary-ai-mbtn { background: #2E2D2B !important; color: #F0EFEB !important; border: 1px solid #42413D !important; }
            body[data-theme="dark"] .shipidle-crack-summary-ai-mbtn-p { background: #F0EFEB !important; color: #1A1918 !important; }
            body[data-theme="dark"] .shipidle-crack-summary-count-error { color: #ff6b6b !important; }
        `;
        document.head.appendChild(s);
    }

    function showToast(message) {
        var old = document.getElementById('shipidle-crack-summary-toast');
        if (old) old.remove();
        var toast = document.createElement('div');
        toast.id = 'shipidle-crack-summary-toast';
        toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%) translateY(-10px);z-index:999999999;background:#1a1a1a;color:#fff;padding:12px 24px;border-radius:10px;font-size:14px;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:opacity 0.3s,transform 0.3s;';
        toast.textContent = message;
        document.body.appendChild(toast);
        requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(-50%) translateY(0)'; });
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(-50%) translateY(-10px)'; setTimeout(() => toast.remove(), 300); }, 3000);
    }

    function refreshCurrentTab(dialog) {
        var btns = dialog.querySelectorAll('button'), activeBtn = null, otherBtn = null;
        for (var i = 0; i < btns.length; i++) {
            var txt = btns[i].textContent.trim();
            if (txt === '단기 기억' || txt === '장기 기억') {
                var bg = getComputedStyle(btns[i]).backgroundColor;
                var m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (m && (parseInt(m[1]) + parseInt(m[2]) + parseInt(m[3])) / 3 < 128) activeBtn = btns[i];
                else if (txt === '장기 기억') otherBtn = btns[i];
            }
        }
        if (!activeBtn) return;
        if (otherBtn) { otherBtn.click(); setTimeout(() => { activeBtn.click(); }, 150); }
        else { activeBtn.click(); }
    }

    function showAiSummaryModal() {
        var overlay = document.createElement('div');
        overlay.className = 'shipidle-crack-summary-ai-overlay';
        overlay.style.position = 'fixed'; overlay.style.inset = '0'; overlay.style.display = 'flex'; overlay.style.alignItems = 'center'; overlay.style.justifyContent = 'center';

        const savedApiKey = localStorage.getItem('shipidle_crack_summary_gemini_key') || '';
        const savedModel = localStorage.getItem('shipidle_crack_summary_gemini_model') || 'gemini-3.1-pro-preview';
        const savedTurnCount = localStorage.getItem('shipidle_crack_summary_turn_count') || '15';
        const savedProvider = localStorage.getItem('shipidle_crack_summary_api_provider') || 'google';
        const savedFirebaseScript = localStorage.getItem('shipidle_crack_summary_firebase_script') || '';

        let isPromptMode = false;
        let tempResultContent = "";

        let parsedCards = [];
        let currentCardIndex = 0;

        var html = '<div class="shipidle-crack-summary-ai-modal">';
        html += '<div class="shipidle-crack-summary-ai-modal-header"><h3>✨ AI 요약 / 장기 기억 추가</h3></div>';

        html += '<div class="crack-flex-ai-row" id="shipidle-ai-summary-top-settings">';
        html += '<div class="fg" style="flex: 1.2;"><label>API</label><select id="shipidle-ai-summary-provider"><option value="google" ' + (savedProvider==='google'?'selected':'') + '>Google</option><option value="firebase" ' + (savedProvider==='firebase'?'selected':'') + '>Firebase</option></select></div>';
        html += '<div class="fg" id="shipidle-ai-summary-key-container" style="flex: 2;' + (savedProvider==='google'?'':'display:none;') + '"><label>API Key</label><input type="password" id="shipidle-ai-summary-key" value="' + escapeHtml(savedApiKey) + '"></div>';
        html += '<div class="fg" style="flex: 1.5;"><label>모델</label><select id="shipidle-ai-summary-model">';
        html += '<option value="gemini-3.1-pro-preview" ' + (savedModel==='gemini-3.1-pro-preview'?'selected':'') + '>3.1 Pro Preview</option>';
        html += '<option value="gemini-3-flash-preview" ' + (savedModel==='gemini-3-flash-preview'?'selected':'') + '>3 Flash Preview</option>';
        html += '<option value="gemini-3.1-flash-lite-preview" ' + (savedModel==='gemini-3.1-flash-lite-preview'?'selected':'') + '>3.1 Flash-Lite</option>';
        html += '<option value="gemini-2.5-pro" ' + (savedModel==='gemini-2.5-pro'?'selected':'') + '>2.5 Pro</option>';
        html += '<option value="gemini-2.5-flash" ' + (savedModel==='gemini-2.5-flash'?'selected':'') + '>2.5 Flash</option>';
        html += '<option value="gemini-2.5-flash-lite" ' + (savedModel==='gemini-2.5-flash-lite'?'selected':'') + '>2.5 Flash-Lite</option>';
        html += '</select></div>';
        html += '<div class="fg" style="flex: 0.8;"><label>턴 수</label><input type="number" id="shipidle-ai-summary-turns" value="' + escapeHtml(savedTurnCount) + '" min="0"></div>';
        html += '</div>';

        html += '<div class="crack-flex-ai-row" id="shipidle-ai-summary-firebase-container" style="margin-bottom:16px;' + (savedProvider==='firebase'?'':'display:none;') + '">';
        html += '<div class="fg" style="flex: 1;"><label>Firebase Vertex AI 스크립트</label><textarea id="shipidle-ai-summary-firebase-script" rows="2" placeholder="firebaseConfig = { ... }; 형식의 스크립트를 입력해주세요.">' + escapeHtml(savedFirebaseScript) + '</textarea></div>';
        html += '</div>';

        html += '<div class="fg"><label id="shipidle-ai-summary-result-label-wrapper" style="display:flex; justify-content:space-between;">';
        html += '<span id="shipidle-ai-summary-result-label">생성 결과</span>';
        html += '<div style="display:flex; align-items:center; gap:10px;">';
        html += '<span id="shipidle-ai-summary-selection-counter" style="color:#a777e3; font-size:12px; font-weight:normal;"></span>';
        html += '<button id="shipidle-ai-summary-toggle-prompt" style="font-size:12px; background:none; border:1px solid #ddd; padding:4px 8px; border-radius:4px; cursor:pointer;">⚙️ 프롬프트 설정</button>';
        html += '</div></label>';

        html += '<textarea id="shipidle-ai-summary-result" rows="7" placeholder="생성 버튼을 누르면 요약 결과가 나오고, 직접 써서 추가할 수도 있습니다. 여러 개의 사건을 [제목] 내용 형식으로 적어주면 자동으로 분리해서 추가됩니다."></textarea>';

        html += '<div id="shipidle-ai-summary-preview-container">';
        html += '<div id="shipidle-ai-summary-card-nav" style="display:none;"><button id="shipidle-ai-summary-card-prev">◀</button><span id="shipidle-ai-summary-card-page">1 / 1</span><button id="shipidle-ai-summary-card-next">▶</button></div>';
        html += '<div id="shipidle-ai-summary-preview-cards"></div>';
        html += '</div></div>';

        html += '<div class="shipidle-crack-summary-ai-modal-btns" style="justify-content: space-between; align-items: flex-end;">';
        html += '<div><button class="shipidle-crack-summary-ai-mbtn" id="shipidle-ai-summary-generate">요약 생성</button></div>';
        html += '<div style="display:flex; gap:8px;"><button class="shipidle-crack-summary-ai-mbtn" id="shipidle-ai-summary-cancel">취소</button><button class="shipidle-crack-summary-ai-mbtn shipidle-crack-summary-ai-mbtn-p" id="shipidle-ai-summary-save">추가하기</button></div></div></div>';

        overlay.innerHTML = html;
        document.body.appendChild(overlay);

        const txtResult = overlay.querySelector('#shipidle-ai-summary-result');
        const selCounter = overlay.querySelector('#shipidle-ai-summary-selection-counter');
        const previewCards = overlay.querySelector('#shipidle-ai-summary-preview-cards');
        const cardNav = overlay.querySelector('#shipidle-ai-summary-card-nav');
        const spanCardPage = overlay.querySelector('#shipidle-ai-summary-card-page');
        const btnCardPrev = overlay.querySelector('#shipidle-ai-summary-card-prev');
        const btnCardNext = overlay.querySelector('#shipidle-ai-summary-card-next');
        const btnSave = overlay.querySelector('#shipidle-ai-summary-save');

        const selProvider = overlay.querySelector('#shipidle-ai-summary-provider');
        const contKey = overlay.querySelector('#shipidle-ai-summary-key-container');
        const contFirebase = overlay.querySelector('#shipidle-ai-summary-firebase-container');
        const inputFirebaseScript = overlay.querySelector('#shipidle-ai-summary-firebase-script');

        selProvider.onchange = () => {
            if(selProvider.value === 'google') {
                contKey.style.display = 'block';
                contFirebase.style.display = 'none';
            } else {
                contKey.style.display = 'none';
                contFirebase.style.display = 'flex';
            }
        };

        function updateSelectionCount() {
            const selectedText = txtResult.value.substring(txtResult.selectionStart, txtResult.selectionEnd);
            selCounter.textContent = selectedText.length > 0 ? `(드래그: ${selectedText.length}자)` : '';
        }
        txtResult.addEventListener('select', updateSelectionCount);
        txtResult.addEventListener('keyup', updateSelectionCount);
        txtResult.addEventListener('mouseup', updateSelectionCount);

        function updatePreviewCards() {
            if(isPromptMode) { previewCards.innerHTML = ''; cardNav.style.display = 'none'; return; }
            const content = txtResult.value.trim();
            if(!content) { previewCards.innerHTML = ''; cardNav.style.display = 'none'; parsedCards = []; return; }

            const blocks = content.split(/\[(.*?)\]/);
            parsedCards = [];

            for (let i = 1; i < blocks.length; i += 2) {
                let title = blocks[i].trim();
                let summary = blocks[i+1] ? blocks[i+1].replace(/^[\s\n]*[-*]?\s*/, '').trim() : '';
                if (title || summary) parsedCards.push({ title, summary });
            }

            if (parsedCards.length === 0 && content) {
                let summary = content.replace(/^[\s\n]*[-*]?\s*/, '').trim();
                parsedCards.push({ title: "수동 요약", summary });
            }

            if (parsedCards.length === 0) {
                previewCards.innerHTML = ''; cardNav.style.display = 'none'; return;
            }

            if (currentCardIndex >= parsedCards.length) currentCardIndex = parsedCards.length - 1;
            if (currentCardIndex < 0) currentCardIndex = 0;

            if (parsedCards.length > 1) {
                cardNav.style.display = 'flex';
                spanCardPage.textContent = `${currentCardIndex + 1} / ${parsedCards.length}`;
            } else {
                cardNav.style.display = 'none';
            }

            let mem = parsedCards[currentCardIndex];
            let tClass = mem.title.length > 20 ? 'shipidle-crack-summary-count-error' : '';
            let sClass = mem.summary.length > 300 ? 'shipidle-crack-summary-count-error' : '';

            let cardHtml = '<div class="shipidle-crack-summary-session-card">' +
                '<div class="shipidle-crack-summary-session-title">' +
                '<div><span style="color:#888;">[ </span>' + escapeHtml(mem.title) + '<span style="color:#888;"> ]</span></div>' +
                '<span class="shipidle-crack-summary-char-count ' + tClass + '">(' + mem.title.length + '/20자)</span>' +
                '</div>' +
                '<div class="shipidle-crack-summary-session-content">' + escapeHtml(mem.summary) +
                '<div style="text-align:right; margin-top:8px;"><span class="shipidle-crack-summary-char-count ' + sClass + '">(' + mem.summary.length + '/300자)</span></div>' +
                '</div>' +
                '</div>';

            previewCards.innerHTML = cardHtml;
        }

        txtResult.addEventListener('input', updatePreviewCards);

        btnCardPrev.onclick = (e) => { e.preventDefault(); if (currentCardIndex > 0) { currentCardIndex--; updatePreviewCards(); } };
        btnCardNext.onclick = (e) => { e.preventDefault(); if (currentCardIndex < parsedCards.length - 1) { currentCardIndex++; updatePreviewCards(); } };

        const btnGen = overlay.querySelector('#shipidle-ai-summary-generate'), btnCancel = overlay.querySelector('#shipidle-ai-summary-cancel');
        const inputKey = overlay.querySelector('#shipidle-ai-summary-key'), inputModel = overlay.querySelector('#shipidle-ai-summary-model'), inputTurns = overlay.querySelector('#shipidle-ai-summary-turns');
        const btnTogglePrompt = overlay.querySelector('#shipidle-ai-summary-toggle-prompt');

        btnTogglePrompt.onclick = (e) => {
            e.stopPropagation(); e.preventDefault();
            isPromptMode = !isPromptMode;
            if (isPromptMode) {
                tempResultContent = txtResult.value;
                txtResult.value = localStorage.getItem('shipidle_crack_summary_custom_prompt') || DEFAULT_PROMPT;
                btnTogglePrompt.textContent = '돌아가기';
                overlay.querySelector('#shipidle-ai-summary-top-settings').style.display = 'none';
                if(overlay.querySelector('#shipidle-ai-summary-firebase-container')) overlay.querySelector('#shipidle-ai-summary-firebase-container').style.display = 'none';
                btnSave.style.display = 'none'; btnGen.style.display = 'none';
                updatePreviewCards();
            } else {
                localStorage.setItem('shipidle_crack_summary_custom_prompt', txtResult.value.trim());
                txtResult.value = tempResultContent;
                btnTogglePrompt.textContent = '⚙️ 프롬프트 설정';
                overlay.querySelector('#shipidle-ai-summary-top-settings').style.display = 'flex';
                if(selProvider.value === 'firebase') overlay.querySelector('#shipidle-ai-summary-firebase-container').style.display = 'flex';
                btnSave.style.display = 'block'; btnGen.style.display = 'block';
                updatePreviewCards();
            }
        };

        btnCancel.onclick = e => { e.stopPropagation(); overlay.remove(); };
        ['click', 'mousedown', 'mouseup'].forEach(evt => overlay.addEventListener(evt, e => e.stopPropagation()));

        btnGen.onclick = async (e) => {
            e.stopPropagation();
            const provider = selProvider.value;
            const apiKey = inputKey.value.trim();
            const firebaseScript = inputFirebaseScript.value.trim();
            const model = inputModel.value;
            const turnsVal = parseInt(inputTurns.value, 10);
            const turns = isNaN(turnsVal) ? 15 : turnsVal;

            if (provider === 'google' && !apiKey) return alert("API Key를 입력해주세요.");
            if (provider === 'firebase' && !firebaseScript) return alert("Firebase 스크립트를 입력해주세요.");

            localStorage.setItem('shipidle_crack_summary_api_provider', provider);
            localStorage.setItem('shipidle_crack_summary_gemini_key', apiKey);
            localStorage.setItem('shipidle_crack_summary_firebase_script', firebaseScript);
            localStorage.setItem('shipidle_crack_summary_gemini_model', model);
            localStorage.setItem('shipidle_crack_summary_turn_count', turns.toString());

            btnGen.disabled = true; btnSave.disabled = true; txtResult.value = "요약 중..."; currentCardIndex = 0; updatePreviewCards();

            try {
                const chatLog = await fetchRecentMessages(turns);
                if (!chatLog) throw new Error("내역을 불러올 수 없습니다.");

                let finalResult = "";
                if (provider === 'google') {
                    // turns 변수 추가
                    finalResult = await callGeminiApi(apiKey, model, chatLog, turns);
                } else {
                    // turns 변수 추가
                    finalResult = await callFirebaseApi(firebaseScript, model, chatLog, turns);
                }

                txtResult.value = finalResult.trim();
            } catch (err) {
                txtResult.value = "오류: " + err.message;
            } finally {
                btnGen.disabled = false; btnSave.disabled = false; btnGen.textContent = "재생성 (리롤)"; updatePreviewCards();
            }
        };

        btnSave.onclick = async (e) => {
            e.stopPropagation();
            const content = txtResult.value.trim();
            if (!content) return alert("결과가 비어있습니다.");

            let isExceeded = false;
            let errorIndex = -1;

            for (let i = 0; i < parsedCards.length; i++) {
                if (parsedCards[i].title.length > 20 || parsedCards[i].summary.length > 300) {
                    isExceeded = true;
                    errorIndex = i;
                    break;
                }
            }

            if (isExceeded) {
                currentCardIndex = errorIndex;
                updatePreviewCards();
                alert("글자 수 제한(제목 20자, 내용 300자)을 초과한 항목이 있습니다.\n붉은색으로 표시된 내용을 수정해 주세요.");
                return;
            }

            btnSave.disabled = true; btnCancel.disabled = true;
            let successCount = 0;

            for (let i = 0; i < parsedCards.length; i++) {
                btnSave.textContent = `추가 중... (${i + 1}/${parsedCards.length})`;
                await new Promise(resolve => setTimeout(resolve, 50));
                const res = await apiCall('POST', '/summaries', { type: 'shortTerm', title: parsedCards[i].title, summary: parsedCards[i].summary });
                if (res) successCount++;
                else alert(`[${parsedCards[i].title}] 추가 중 오류 발생`);
            }

            if (successCount > 0) {
                showToast(`✅ ${successCount}개의 요약이 장기 기억에 추가되었습니다.`);
                overlay.remove();
                var dialogEl = document.querySelector('[role="dialog"]');
                if (dialogEl) refreshCurrentTab(dialogEl);
            } else {
                btnSave.textContent = "추가하기"; btnSave.disabled = false; btnCancel.disabled = false;
            }
        };
    }

    // ------------------------------------------------------------------
    //  UI 주입 최적화 v1.5.4
    //  - body 전체 상시 감시 금지
    //  - 방 이동 직후 React 헤더 재마운트로 버튼이 날아가는 문제 보강
    //  - route 변경 후 몇 초 동안만 짧은 burst 재주입 + transient observer 유지
    // ------------------------------------------------------------------
    const SHIPIDLE_AI_SUMMARY_BTN_CLASS = 'shipidle-crack-summary-header-ai-btn';
    const TRANSIENT_OBSERVER_MS = 9500;
    const ROUTE_RETRY_DELAYS = [80, 180, 360, 700, 1100, 1700, 2500, 3600, 5200, 7600, 9400];

    let lastUrlKey = getUrlKey();
    let transientObserver = null;
    let transientObserverTimer = 0;
    let injectRaf = 0;
    let burstTimers = [];
    let lastInteractionKick = 0;

    function getUrlKey() {
        return location.pathname + location.search + location.hash;
    }

    function isEpisodePage() {
        return /\/episodes\//.test(location.pathname);
    }

    function clearBurstTimers() {
        burstTimers.forEach(timer => clearTimeout(timer));
        burstTimers = [];
    }

    function isBadContainer(el) {
        return !el || !el.isConnected ||
            !!el.closest('.shipidle-crack-summary-ai-modal, .shipidle-crack-summary-ai-overlay, [data-message-group-id], .ProseMirror, textarea, input');
    }

    function isLikelyTopHeaderContainer(el) {
        if (isBadContainer(el)) return false;

        const buttonCount = el.querySelectorAll('button').length;
        if (buttonCount < 1) return false;

        const text = String(el.textContent || '').replace(/\s+/g, ' ').trim();
        if (text.length > 120) return false;

        // 헤더는 보통 화면 상단에 있으므로, 하단 입력창/채팅 본문 오인식을 줄인다.
        try {
            const rect = el.getBoundingClientRect();
            if (rect && Number.isFinite(rect.top) && rect.top > 180) return false;
        } catch (_) {}

        return true;
    }

    function findHeaderContainer() {
        // 1순위: 기존 원본이 쓰던 정확한 상단 우측 버튼 묶음.
        const directSelectors = [
            '.absolute.z-\\[5\\] .flex.gap-3.items-center',
            'header .flex.gap-3.items-center',
            '[class*="z-"] .flex.gap-3.items-center'
        ];

        for (const selector of directSelectors) {
            const el = document.querySelector(selector);
            if (isLikelyTopHeaderContainer(el)) return el;
        }

        // 2순위: 크랙 기본 헤더 버튼을 앵커로 삼아 부모 버튼 묶음을 찾는다.
        // 사용자가 엔딩 힌트 버튼을 CSS로 숨겨도 DOM에는 남아 있을 수 있어 기준점으로 쓸 수 있다.
        const anchorSelectors = [
            'button[aria-label="엔딩 힌트"]',
            'button[aria-label*="엔딩"]',
            'button[aria-label*="힌트"]',
            'button[aria-label*="공유"]',
            'button[aria-label*="설정"]',
            'button[aria-label*="메뉴"]'
        ];

        for (const selector of anchorSelectors) {
            const anchor = document.querySelector(selector);
            const container = anchor?.closest?.('.flex.gap-3.items-center, .flex.items-center, [class*="items-center"]');
            if (isLikelyTopHeaderContainer(container)) return container;
        }

        // 3순위: 상단 영역 안의 버튼 묶음 중 가장 헤더답게 보이는 것을 선택.
        const roots = Array.from(document.querySelectorAll('header, .absolute, [class*="z-"]'));
        for (const root of roots) {
            if (isBadContainer(root)) continue;
            const candidates = Array.from(root.querySelectorAll('.flex.gap-3.items-center, .flex.items-center, [class*="items-center"]'));
            const found = candidates.find(isLikelyTopHeaderContainer);
            if (found) return found;
        }

        return null;
    }

    function removeAiButtons() {
        document.querySelectorAll('.' + SHIPIDLE_AI_SUMMARY_BTN_CLASS).forEach(btn => btn.remove());
    }

    function createAiButton() {
        const aiBtn = document.createElement('button');
        aiBtn.className = SHIPIDLE_AI_SUMMARY_BTN_CLASS;
        aiBtn.type = 'button';
        aiBtn.innerHTML = '✨요약';
        aiBtn.dataset.ceAiSummary = 'true';
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            showAiSummaryModal();
        });
        return aiBtn;
    }

    function injectTopHeaderBtn() {
        if (!isEpisodePage()) {
            removeAiButtons();
            return true;
        }

        const headerContainer = findHeaderContainer();
        if (!headerContainer) return false;

        const existingInHeader = headerContainer.querySelector('.' + SHIPIDLE_AI_SUMMARY_BTN_CLASS);
        if (existingInHeader) {
            existingInHeader.style.display = 'inline-flex';
            return true;
        }

        // 다른 위치에 잘못 붙은 기존 버튼은 정리하고 현재 헤더에 새로 붙인다.
        removeAiButtons();
        headerContainer.prepend(createAiButton());
        return true;
    }

    function inject() {
        injectAiStyles();
        return injectTopHeaderBtn();
    }

    function scheduleInject(reason = 'schedule') {
        if (injectRaf) return;
        injectRaf = requestAnimationFrame(() => {
            injectRaf = 0;
            inject();
        });
    }

    function stopTransientObserver() {
        if (transientObserver) {
            transientObserver.disconnect();
            transientObserver = null;
        }
        clearTimeout(transientObserverTimer);
        transientObserverTimer = 0;
    }

    function startTransientObserver(reason = 'route') {
        stopTransientObserver();
        if (!document.body) return;

        transientObserver = new MutationObserver(() => {
            scheduleInject(reason + ':observer');
        });

        // 상시 감시가 아니라 방 이동/부팅 직후에만 잠깐 켜진다. attributes/characterData는 보지 않는다.
        transientObserver.observe(document.body, { childList: true, subtree: true });
        transientObserverTimer = setTimeout(stopTransientObserver, TRANSIENT_OBSERVER_MS);
    }

    function runInjectBurst(reason = 'burst') {
        clearBurstTimers();
        ROUTE_RETRY_DELAYS.forEach(delay => {
            const timer = setTimeout(() => scheduleInject(reason + ':' + delay), delay);
            burstTimers.push(timer);
        });
    }

    function handleRouteRefresh(reason = 'route', options = {}) {
        const urlChanged = getUrlKey() !== lastUrlKey;
        if (urlChanged) {
            lastUrlKey = getUrlKey();
            // 이전 방 헤더에 붙어 있던 버튼 때문에 "성공"으로 오판하지 않도록 먼저 지운다.
            removeAiButtons();
        }

        if (options.full || urlChanged) {
            startTransientObserver(reason);
            runInjectBurst(reason);
        } else {
            scheduleInject(reason);
        }
    }

    function installRouteWatcher() {
        if (window.__ceAiSummaryRouteWatcher154) return;
        window.__ceAiSummaryRouteWatcher154 = true;

        ['pushState', 'replaceState'].forEach(method => {
            const original = history[method];
            if (typeof original !== 'function' || original.__ceAiSummaryWrapped154) return;

            const wrapped = function () {
                const result = original.apply(this, arguments);
                setTimeout(() => handleRouteRefresh(method, { full: true }), 0);
                return result;
            };
            wrapped.__ceAiSummaryWrapped154 = true;
            history[method] = wrapped;
        });

        window.addEventListener('popstate', () => setTimeout(() => handleRouteRefresh('popstate', { full: true }), 0), { passive: true });
        window.addEventListener('hashchange', () => setTimeout(() => handleRouteRefresh('hashchange', { full: true }), 0), { passive: true });
        window.addEventListener('pageshow', () => handleRouteRefresh('pageshow', { full: true }), { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) handleRouteRefresh('visible', { full: true });
        }, { passive: true });

        // 방 이동 후 첫 클릭/포커스 때 헤더가 늦게 살아나는 케이스 보정.
        // 클릭마다 무거운 탐색을 하지 않도록 900ms로 제한한다.
        document.addEventListener('focusin', () => {
            const now = Date.now();
            if (now - lastInteractionKick < 900) return;
            lastInteractionKick = now;
            handleRouteRefresh('focusin');
        }, { passive: true });

        document.addEventListener('click', () => {
            const now = Date.now();
            if (now - lastInteractionKick < 900) return;
            lastInteractionKick = now;
            handleRouteRefresh('click');
        }, { passive: true, capture: true });
    }

    function start() {
        injectAiStyles();
        installRouteWatcher();
        startTransientObserver('start');
        runInjectBurst('start');
        scheduleInject('start');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
})();
