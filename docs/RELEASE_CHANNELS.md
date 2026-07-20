# Release channels

## 역할

- `main`: 사용자가 테스트 완료를 확인한 안정판
- `beta`: 현재 실사용 테스트판을 가리키는 고정 브랜치
- `feat/*`, `fix/*`: 최신 `main`에서 시작하는 개별 작업 브랜치

`beta`는 여러 작업 브랜치 이름을 사용자가 기억하지 않게 하는 배포 채널이다. 작업 브랜치와 Pull Request가 존재해도 Merge 전에는 `main`이 바뀌지 않는다.

## 작업 브랜치

작업 브랜치의 `.user.js` 메타데이터는 `main`을 유지한다. PR에 `beta` 전용 URL이나 `🧪 BETA` 설명 표식을 넣지 않는다.

검사:

```powershell
node scripts/set-userscript-channel.mjs --channel main --check
node scripts/generate-install-center.mjs --check
```

## beta 배포

테스트할 커밋들을 `beta`에 반영한 뒤 다음 두 명령을 실행하고 결과를 커밋한다.

```powershell
node scripts/set-userscript-channel.mjs --channel beta
node scripts/generate-install-center.mjs
```

이 작업은 루트의 활성 `.user.js`가 `beta`의 Raw URL을 따라가게 하고, 설명 앞에 `🧪 BETA`를 붙인다. 스크립트의 `@name`과 `@namespace`는 바꾸지 않으므로 Stay에서 같은 스크립트로 덮어쓸 수 있다.

## main 반영

사용자가 테스트 완료와 Merge를 명시한 뒤에만 작업 PR을 `main`에 Merge한다. `main`에 들어가는 파일은 아래 검사를 통과해야 한다.

```powershell
node scripts/set-userscript-channel.mjs --channel main --check
node scripts/generate-install-center.mjs --check
```

## 설치 목록 관리

- 저장소 루트의 새 `.user.js`는 기본적으로 모든 기기 목록에 자동 추가된다.
- 모든 `archive/` 파일은 자동 제외된다.
- 기기별 예외는 `install-center.config.json`에서만 관리한다.
- `INSTALL.md`는 직접 수정하지 않고 생성기로 다시 만든다.
