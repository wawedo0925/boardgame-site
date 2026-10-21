# 구글 캘린더 바로 저장 설정

직접 저장 코드에는 운영자가 제공한 공개 OAuth 웹 클라이언트 ID가 기본값으로 설정되어 있습니다. `NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID`로 환경별 값을 덮어쓸 수 있고, 빈 문자열을 설정하면 직접 저장 버튼을 숨깁니다. 클라이언트 ID는 공개 식별자이며 클라이언트 보안 비밀은 사용하거나 보관하지 않습니다.

1. Google Cloud에서 프로젝트를 선택하고 Google Calendar API를 활성화합니다.
2. Google Auth Platform에서 앱 이름, 지원 이메일, 대상 사용자와 OAuth 동의 화면을 설정합니다. 요청 범위는 `https://www.googleapis.com/auth/calendar.events.owned`입니다. 운영 공개에는 Google의 검증 요건을 확인해야 합니다. 테스트 상태에서는 등록한 테스트 사용자만 이용할 수 있습니다.
3. OAuth 클라이언트를 **웹 애플리케이션**으로 생성합니다. 승인된 JavaScript 원본에 `https://boardlounge.kr`을 넣고, 다른 실제 서비스 도메인이나 로컬 테스트 주소를 사용하는 경우 별도로 등록합니다. 이 팝업 토큰 방식에는 서버 콜백이나 클라이언트 보안 비밀이 필요하지 않습니다.
4. 공개 클라이언트 ID (`...apps.googleusercontent.com`)를 로컬 및 Vercel 환경 변수 `NEXT_PUBLIC_GOOGLE_CALENDAR_CLIENT_ID`에 설정하고 다시 빌드·배포합니다. 클라이언트 보안 비밀은 브라우저 변수에 넣지 않습니다.
5. 테스트 계정으로 직접 저장·연결 취소·팝업 차단·중복 클릭·토큰 만료를 검증합니다. 실제 Google 동의 및 쓰기 테스트는 계정 소유자가 진행합니다.

저장 대상은 연결한 구글 계정의 기본 캘린더입니다. 토큰은 컴포넌트 메모리에만 두며 DB, localStorage, 로그에 저장하지 않습니다. 새로고침이나 만료 후에는 다시 연결할 수 있습니다. 저장 버튼 클릭으로만 권한 요청과 쓰기를 수행합니다. 모임별 고정 ID로 재시도 중 중복 생성을 방지하며 기존 일정 수정·삭제는 수행하지 않습니다. 종료 시간 미정 모임은 임의 시간을 정해 저장하지 않습니다.

참고: https://developers.google.com/identity/oauth2/web/guides/use-token-model
참고: https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
