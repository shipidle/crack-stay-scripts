# crack-stay-scripts

[📦 고정 설치센터 열기](./INSTALL.md)

[🧍 캐릭터 상태 삽입기 사용법](./docs/CHARACTER_STATE.md)

[🔖 채팅 찾기·북마크 사용법 (beta)](./docs/CHAT_BOOKMARKS.md)

- `beta`: 최신 수정본을 먼저 사용하는 실사용 테스트 채널
- `main`: 테스트 완료 후 Merge된 안정 채널

최초 설치·새 기기·채널 전환은 설치센터를 사용하고, 평소 업데이트는 Stay 또는 Tampermonkey에서 실행하면 됨.

### BETA Supabase 브리지 v1.6.0

- 기존 `Crack_Lore_Sync_Bridge.user.js`를 업데이트해 사용. 설치 식별 이름과 저장 키를 유지하므로 기존 연결 정보·로그인·요약 암호를 이어서 사용함. 내부 패널 이름은 **크랙 Supabase 연동**.
- 로어 인젝터 자동 탐색·백업·복원을 제거함. 기존 로컬 로어 자료와 Supabase 로어 백업은 삭제하지 않음.
- 개인 요약 메모리의 턴 체크포인트·암호화 작업 복구, 배경·번역·메신저 API는 유지함. RP 매니저는 별도 자체 동기화를 사용함.
- 모든 크랙 주소에서 브리지를 실행하여 다른 화면에서 채팅방으로 이동해도 API가 유지됨. 개인 요약 메모리 v2.3.5는 브리지 로딩을 기다리며, 연결 실패를 설치 버전 부족으로 표시하지 않음. 두 스크립트를 업데이트한 뒤 열려 있는 크랙 페이지를 새로고침해야 함.
- 검증: `node scripts/test-supabase-bridge.mjs`, `node scripts/test-memory-auth.mjs`, `node scripts/test-messenger.mjs`, `node scripts/test-storage-maintenance.mjs`.
