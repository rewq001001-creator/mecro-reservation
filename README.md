# mecro-reservation

IIC Restaurant 예약 자동화 프로젝트입니다.

## 동작 방식

- 한국 시간 기준 매일 오전 8:00부터 예약을 시작합니다.
- GitHub Actions는 한국 시간 오전 8:00부터 8:30까지 5분 간격으로 여러 번 트리거됩니다.
- GitHub Actions가 조금 늦게 시작돼도 오전 8:30 전이라면 예약 완료를 목표로 계속 진행합니다.
- 사이트가 닫혀 있거나 예약 화면이 보이지 않으면 즉시 종료합니다.
- 성공 팝업이 뜨면 해당 예약자는 더 이상 시도하지 않습니다.
- 예약에 성공하면 3초 기다린 뒤 다음 예약자를 시도합니다.
- 실행 로그는 콘솔과 `logs/latest.log` 파일에 함께 남습니다.
- 예약 완료가 확인되면 `logs/evidence` 폴더에 완료 화면 스크린샷, HTML, 텍스트를 저장합니다.
- GitHub Actions 스케줄은 지연/누락될 수 있어, 운영 기준으로는 Cloud Run + Cloud Scheduler 구성이 더 안정적입니다.

## 예약자 추가

`config/reservations.json` 파일의 `reservations` 배열에 항목을 추가하면 됩니다.

```json
{
  "label": "guest-2",
  "enabled": true,
  "time": "12:00",
  "phone": "010-1234-5678"
}
```

`label`은 로그에서 구분용 이름입니다.

## 로컬 실행

```bash
npm install
npx playwright install chromium
npm run run:reservation
```

수동 테스트로 시간 제한을 잠시 무시하고 싶다면 아래처럼 실행할 수 있습니다.

```bash
IGNORE_SCHEDULE_WINDOW=1 npm run run:reservation
```

PowerShell에서는 아래처럼 실행하면 됩니다.

```powershell
$env:IGNORE_SCHEDULE_WINDOW='1'
npm run run:reservation
```

## Cloud Run 배포

컴퓨터를 꺼도 안정적으로 실행하려면 Cloud Run 서비스로 배포하고 Cloud Scheduler가 매일 한국 시간 08:00에 `/run` 엔드포인트를 호출하도록 구성하는 것이 권장됩니다.

이 레포는 이미 Cloud Run용 파일을 포함합니다.

- [Dockerfile](/C:/Users/GENTLE%20MONSTER/Desktop/187/%E2%96%B6Codex/repo/Dockerfile)
- [server.js](/C:/Users/GENTLE%20MONSTER/Desktop/187/%E2%96%B6Codex/repo/src/server.js)
- [deploy-cloud-run.ps1](/C:/Users/GENTLE%20MONSTER/Desktop/187/%E2%96%B6Codex/repo/scripts/deploy-cloud-run.ps1)

Windows PowerShell에서 배포 예시는 아래와 같습니다.

```powershell
gcloud auth login
gcloud auth application-default login
.\scripts\deploy-cloud-run.ps1 -ProjectId "YOUR_GCP_PROJECT_ID"
```

배포가 끝나면 Cloud Scheduler가 매일 `08:00 Asia/Seoul`에 Cloud Run을 호출합니다. 서비스 내부 로직은 예약 확인 후 없을 때만 시도하고, 예약이 조회되면 즉시 멈춥니다.

## GitHub Actions 로그 보기

1. GitHub 저장소의 `Actions` 탭으로 이동합니다.
2. `Reservation Bot` 워크플로를 선택합니다.
3. 실행 기록을 열면 콘솔 로그를 바로 볼 수 있습니다.
4. 실행이 끝난 뒤 `reservation-logs` 아티팩트를 다운로드하면 파일 로그도 확인할 수 있습니다.

## 주의

GitHub Actions의 `schedule`은 완전히 초 단위로 정확하지 않고 몇 분 지연되거나 누락될 수 있습니다. 현재 구성은 이를 줄이기 위해 08:00~08:30 구간에 여러 번 트리거되도록 보강되어 있습니다.

현재 예약 시간 기본값은 `12:00`입니다.
