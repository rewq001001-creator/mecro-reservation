import { loadConfig, getConfigPath } from "./config.js";
import { createLogger } from "./logger.js";
import { runReservationBot } from "./reservationBot.js";
import { getScheduleWindowStatus } from "./time.js";

async function main() {
  const logger = createLogger();
  const config = loadConfig();
  const scheduleStatus = getScheduleWindowStatus(config.schedule, config.timezone);
  const ignoreScheduleWindow = process.env.IGNORE_SCHEDULE_WINDOW === "1";

  logger.info("설정 파일 로드 완료", {
    configPath: getConfigPath(),
    timezone: config.timezone,
    dateKey: scheduleStatus.dateKey,
    ignoreScheduleWindow
  });

  if (!ignoreScheduleWindow && config.schedule.weekdaysOnly && scheduleStatus.isWeekend) {
    logger.info("주말이라 실행하지 않습니다");
    return;
  }

  if (!ignoreScheduleWindow && !scheduleStatus.withinWindow) {
    logger.info("예약 시도 가능 시간이 아니라 종료합니다", {
      currentHour: scheduleStatus.hour,
      currentMinute: scheduleStatus.minute,
      startTime: config.schedule.startTime,
      endTime: config.schedule.endTime
    });
    return;
  }

  const result = await runReservationBot(config, logger);
  logger.info("자동 예약 종료", result ?? {});
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
