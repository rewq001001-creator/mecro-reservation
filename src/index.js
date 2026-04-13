import { loadConfig, getConfigPath } from "./config.js";
import { createLogger } from "./logger.js";
import { runReservationBot } from "./reservationBot.js";
import { getScheduleWindowStatus } from "./time.js";
import { pathToFileURL } from "node:url";

export async function main() {
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

  if (!ignoreScheduleWindow && scheduleStatus.beforeWindow) {
    logger.info("예약 시작 시간 전이라 대기합니다", {
      currentHour: scheduleStatus.hour,
      currentMinute: scheduleStatus.minute,
      startTime: config.schedule.startTime,
      waitSeconds: scheduleStatus.secondsUntilStart
    });
    await new Promise((resolve) => setTimeout(resolve, Math.max(scheduleStatus.secondsUntilStart, 0) * 1000));
  }

  const refreshedStatus = getScheduleWindowStatus(config.schedule, config.timezone);

  if (!ignoreScheduleWindow && !refreshedStatus.beforeLatestAttempt) {
    logger.warn("최대 예약 시도 시간을 지나 종료합니다", {
      currentHour: refreshedStatus.hour,
      currentMinute: refreshedStatus.minute,
      latestAttemptTime: config.schedule.latestAttemptTime ?? config.schedule.endTime
    });
    return;
  }

  if (!ignoreScheduleWindow && refreshedStatus.afterWindow) {
    logger.warn("권장 예약 시간은 지났지만 최대 시도 시간 전이라 계속 진행합니다", {
      currentHour: refreshedStatus.hour,
      currentMinute: refreshedStatus.minute,
      startTime: config.schedule.startTime,
      endTime: config.schedule.endTime,
      latestAttemptTime: config.schedule.latestAttemptTime ?? config.schedule.endTime
    });
  }

  const result = await runReservationBot(
    config,
    logger,
    ignoreScheduleWindow ? null : refreshedStatus.secondsUntilLatestAttemptEnd
  );
  logger.info("자동 예약 종료", result ?? {});
  return result ?? {};
}

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
