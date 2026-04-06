# mecro-reservation

IIC Restaurant 예약 자동화 프로젝트입니다.

## 동작 방식

- 한국 시간 기준 평일 오전 8:00부터 예약을 시작합니다.
- GitHub Actions가 조금 일찍 시작되면 8:00까지 대기합니다.
- GitHub Actions가 조금 늦게 시작돼도 최대 시도 시간 전이라면 예약 완료를 목표로 계속 진행합니다.
- 사이트가 닫혀 있거나 예약 화면이 보이지 않으면 즉시 종료합니다.
- 성공 팝업이 뜨면 해당 예약자는 더 이상 시도하지 않습니다.
- 예약에 성공하면 3초 기다린 뒤 다음 예약자를 시도합니다.
- 실행 로그는 콘솔과 `logs/latest.log` 파일에 함께 남습니다.
- 예약 완료가 확인되면 `logs/evidence` 폴더에 완료 화면 스크린샷, HTML, 텍스트를 저장합니다.
- GitHub Actions 스케줄을 사용하면 컴퓨터를 꺼도 클라우드에서 자동 실행됩니다.

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

## GitHub Actions 로그 보기

1. GitHub 저장소의 `Actions` 탭으로 이동합니다.
2. `Reservation Bot` 워크플로를 선택합니다.
3. 실행 기록을 열면 콘솔 로그를 바로 볼 수 있습니다.
4. 실행이 끝난 뒤 `reservation-logs` 아티팩트를 다운로드하면 파일 로그도 확인할 수 있습니다.

## 주의

GitHub Actions의 `schedule`은 완전히 초 단위로 정확하지 않고 몇 분 지연될 수 있습니다. 더 정확한 시간 보장이 필요하면 같은 코드를 Google Cloud Run + Cloud Scheduler로 옮기는 것이 더 안정적입니다.

현재 설정은 지연을 흡수하기 위해 예열 실행과 정시 실행을 함께 사용하고, 최대 시도 시간 전까지는 예약 완료를 우선합니다.
