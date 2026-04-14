import fs from "node:fs";
import { chromium } from "playwright";

function normalizePhoneNumber(phone) {
  return phone.replace(/[^0-9]/g, "");
}

function normalizeTimeToken(time) {
  return String(time).replace(/[^0-9]/g, "");
}

function getPhoneMatchers(phone) {
  const digits = normalizePhoneNumber(phone);
  const lastFour = digits.slice(-4);
  const maskedPattern = new RegExp(`010[- ]?\\*{2,4}[- ]?${lastFour}`);
  const fullPattern = new RegExp(`010[- ]?${digits.slice(3, 7)}[- ]?${lastFour}`);
  return { digits, lastFour, maskedPattern, fullPattern };
}

function getTodayDateLabel(timeZone) {
  const formatter = new Intl.DateTimeFormat("ko-KR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}년 ${parts.month}월 ${parts.day}일`;
}

function toSafeFileToken(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "-");
}

async function captureCompletionEvidence(page, reservation, logger, modalText, reservationNumber) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = `${stamp}-${toSafeFileToken(reservation.label)}`;
  const screenshotPath = logger.createArtifactPath("evidence", `${prefix}-completion.png`);
  const htmlPath = logger.createArtifactPath("evidence", `${prefix}-completion.html`);
  const textPath = logger.createArtifactPath("evidence", `${prefix}-completion.txt`);

  await page.screenshot({ path: screenshotPath, fullPage: true });
  fs.writeFileSync(htmlPath, await page.content(), "utf8");
  fs.writeFileSync(textPath, modalText, "utf8");

  logger.info("예약 완료 증빙 저장", {
    label: reservation.label,
    screenshotPath,
    htmlPath,
    textPath,
    reservationNumber
  });

  return {
    screenshotPath,
    htmlPath,
    textPath
  };
}

async function clickReservationTab(page, logger) {
  const tab = page.getByRole("button", { name: /^예약하기$/ }).first();
  await tab.waitFor({ state: "visible", timeout: 5000 });
  await tab.click();
  logger.info("예약 탭 선택");
}

async function clickReservationLookupTab(page, logger) {
  const tab = page.getByRole("button", { name: /^예약 확인 및 취소$/ }).first();
  await tab.waitFor({ state: "visible", timeout: 5000 });
  await tab.click();
  logger.info("예약 확인 및 취소 탭 선택");
}

async function lookupReservationByPhone(page, reservation, logger) {
  const phoneInput = page.getByPlaceholder(/010-0000-0000/).first();
  await phoneInput.waitFor({ state: "visible", timeout: 5000 });
  await phoneInput.fill("");
  await phoneInput.fill(normalizePhoneNumber(reservation.phone));

  const lookupButton = page.getByRole("button", { name: /^예약 조회하기$/ }).first();
  await lookupButton.waitFor({ state: "visible", timeout: 5000 });
  await lookupButton.click();
  logger.info("예약 조회 실행", {
    label: reservation.label,
    phone: reservation.phone
  });
}

async function verifyReservationInLookup(page, reservation, logger, timeZone) {
  await clickReservationLookupTab(page, logger);
  await lookupReservationByPhone(page, reservation, logger);
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(500);

  const bodyText = await page.locator("body").innerText();
  const normalizedBodyText = bodyText.replace(/\s+/g, " ");
  const reservationNumberMatch = bodyText.match(/IIC-[0-9-]+/);
  const phoneMatchers = getPhoneMatchers(reservation.phone);
  const hasNoReservationMessage = /오늘 예약 내역이 없습니다\./.test(normalizedBodyText);
  const hasConfirmedBadge = /확정/.test(normalizedBodyText);
  const expectedDate = getTodayDateLabel(timeZone);
  const hasExpectedDate = normalizedBodyText.includes(expectedDate);
  const hasExpectedTime = normalizedBodyText.includes(`${reservation.time} 타임`);
  const hasExpectedPhone =
    phoneMatchers.fullPattern.test(normalizedBodyText) || phoneMatchers.maskedPattern.test(normalizedBodyText);

  if (hasNoReservationMessage) {
    logger.info("예약 조회 결과 오늘 예약 내역이 없습니다", {
      label: reservation.label,
      phone: reservation.phone
    });
    return { success: false, reason: "lookup-empty" };
  }

  if (!hasConfirmedBadge || !hasExpectedDate || !hasExpectedTime || !hasExpectedPhone) {
    logger.info("예약 확인 및 취소 탭에서 최종 확인 조건을 만족하지 못했습니다", {
      label: reservation.label,
      hasNoReservationMessage,
      hasConfirmedBadge,
      hasExpectedDate,
      hasExpectedTime,
      hasExpectedPhone
    });
    return { success: false, reason: "lookup-verification-failed" };
  }

  const evidence = await captureCompletionEvidence(
    page,
    reservation,
    logger,
    bodyText,
    reservationNumberMatch?.[0] ?? null
  );

  logger.info("예약 확인 및 취소 탭에서 예약 내역 확인", {
    label: reservation.label,
    reservationNumber: reservationNumberMatch?.[0] ?? null,
    expectedDate,
    hasExpectedDate,
    hasExpectedTime,
    hasExpectedPhone,
    evidence
  });

  return {
    success: true,
    reservationNumber: reservationNumberMatch?.[0] ?? null,
    evidence
  };
}

async function isSiteClosed(page) {
  const closedKeywords = page.getByText(/운영 종료|예약 종료|예약 불가|closed/i).first();
  if (await closedKeywords.isVisible().catch(() => false)) {
    return true;
  }

  const phoneInput = page.getByPlaceholder(/010-0000-0000/).first();
  const submitButton = page
    .locator("button")
    .filter({ hasText: /예약하기/ })
    .last();
  const timeCards = page.locator("button").filter({ hasText: /11:30|12:00|12:30|13:00/ });

  const hasPhoneInput = await phoneInput.isVisible().catch(() => false);
  const hasSubmitButton = await submitButton.isVisible().catch(() => false);
  const count = await timeCards.count();

  return count === 0 || !hasPhoneInput || !hasSubmitButton;
}

async function selectTimeSlot(page, reservation, logger) {
  const slotButton = page
    .locator("button")
    .filter({ hasText: new RegExp(`^${reservation.time.replace(":", "\\:")}`) })
    .first();

  if ((await slotButton.count()) === 0) {
    logger.warn("타임 버튼을 찾지 못했습니다", { label: reservation.label, time: reservation.time });
    return false;
  }

  const slotText = (await slotButton.innerText()).replace(/\s+/g, " ").trim();
  const isUnavailable =
    /FULL|마감|CLOSED/i.test(slotText) || (await slotButton.getAttribute("disabled")) !== null;

  if (isUnavailable) {
    logger.warn("타임이 아직 열리지 않았거나 마감 상태입니다", {
      label: reservation.label,
      time: reservation.time,
      slotText
    });
    return false;
  }

  await slotButton.click();
  logger.info("예약 시간 선택", { label: reservation.label, time: reservation.time });
  return true;
}

async function fillPhone(page, reservation, logger) {
  const phoneInput = page.getByPlaceholder(/010-0000-0000/).first();
  await phoneInput.waitFor({ state: "visible", timeout: 5000 });
  await phoneInput.fill("");
  await phoneInput.fill(normalizePhoneNumber(reservation.phone));
  logger.info("연락처 입력", { label: reservation.label, phone: reservation.phone });
}

async function submitReservation(page, reservation, logger, timeZone) {
  const submitButton = page
    .locator("button")
    .filter({ hasText: /예약하기/ })
    .last();

  await submitButton.waitFor({ state: "visible", timeout: 5000 });

  if (await submitButton.isDisabled()) {
    logger.warn("예약 버튼이 비활성화되어 있습니다", { label: reservation.label });
    return { success: false, reason: "submit-disabled" };
  }

  await submitButton.click();
  logger.info("예약 제출 클릭", { label: reservation.label });

  const successTitle = page.getByText("예약 완료!", { exact: true });
  const successDescription = page.getByText("예약이 확정되었습니다.", { exact: true });
  const successVisible = await successTitle.waitFor({ state: "visible", timeout: 3000 }).then(
    () => true,
    () => false
  );

  if (!successVisible) {
    logger.warn("성공 팝업이 확인되지 않았습니다", { label: reservation.label });
    return { success: false, reason: "success-popup-not-found" };
  }

  const modalText = await page.locator("body").innerText();
  const normalizedModalText = modalText.replace(/\s+/g, " ");
  const reservationNumberMatch = modalText.match(/IIC-[0-9-]+/);
  const hasSuccessDescription = await successDescription.isVisible().catch(() => false);
  const hasExpectedPhone = normalizedModalText.includes(normalizePhoneNumber(reservation.phone));
  const hasExpectedTime = normalizedModalText.includes(normalizeTimeToken(reservation.time));

  if (!hasSuccessDescription || !reservationNumberMatch || !hasExpectedPhone || !hasExpectedTime) {
    logger.warn("예약 완료 팝업은 보였지만 완료 정보 검증에 실패했습니다", {
      label: reservation.label,
      hasSuccessDescription,
      hasReservationNumber: Boolean(reservationNumberMatch),
      hasExpectedPhone,
      hasExpectedTime
    });
    return { success: false, reason: "completion-details-mismatch" };
  }

  const confirmationButton = page.getByRole("button", { name: /^확인$/ }).first();

  if (await confirmationButton.isVisible().catch(() => false)) {
    await confirmationButton.click();
  }

  logger.info("예약 완료 팝업 확인", {
    label: reservation.label,
    time: reservation.time,
    phone: reservation.phone,
    reservationNumber: reservationNumberMatch[0]
  });

  return verifyReservationInLookup(page, reservation, logger, timeZone);
}

async function attemptReservation(page, reservation, logger, timeZone) {
  const existingReservation = await verifyReservationInLookup(page, reservation, logger, timeZone);
  if (existingReservation.success) {
    logger.info("이미 예약된 내역이 있어 추가 시도를 중단합니다", {
      label: reservation.label,
      reservationNumber: existingReservation.reservationNumber
    });
    return existingReservation;
  }

  await clickReservationTab(page, logger);

  const slotSelected = await selectTimeSlot(page, reservation, logger);
  if (!slotSelected) {
    return { success: false, reason: "slot-unavailable" };
  }

  await fillPhone(page, reservation, logger);
  return submitReservation(page, reservation, logger, timeZone);
}

export async function runReservationBot(config, logger, maxWindowSeconds = null) {
  const browser = await chromium.launch({
    headless: config.browser.headless,
    slowMo: config.browser.slowMo
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 }
  });

  const page = await context.newPage();
  page.setDefaultTimeout(config.browser.actionTimeoutMs);
  page.setDefaultNavigationTimeout(config.browser.navigationTimeoutMs);

  const enabledReservations = config.reservations.filter((reservation) => reservation.enabled);
  const completed = new Set();
  const startedAt = Date.now();
  const fallbackWindowMs = (config.schedule.maxRuntimeMinutes ?? 90) * 60 * 1000;
  const deadline = startedAt + ((maxWindowSeconds ?? 0) > 0 ? maxWindowSeconds * 1000 : fallbackWindowMs);

  logger.info("자동 예약 시작", {
    enabledReservations: enabledReservations.length,
    url: config.site.url
  });

  try {
    await page.goto(config.site.url, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);

    if (await isSiteClosed(page)) {
      logger.warn("사이트가 닫혀 있거나 예약 화면이 보이지 않아 종료합니다");
      return { status: "site-closed" };
    }

    while (Date.now() <= deadline) {
      let didWorkInLoop = false;

      for (const reservation of enabledReservations) {
        if (completed.has(reservation.label)) {
          continue;
        }

        didWorkInLoop = true;
        logger.info("예약 시도", {
          label: reservation.label,
          time: reservation.time,
          phone: reservation.phone
        });

        const result = await attemptReservation(page, reservation, logger, config.timezone);
        if (result.success) {
          completed.add(reservation.label);
          logger.info("다음 예약자로 이동 전 대기", {
            label: reservation.label,
            delayMs: config.schedule.nextReservationDelayMs
          });
          await page.waitForTimeout(config.schedule.nextReservationDelayMs);
          await page.goto(config.site.url, { waitUntil: "domcontentloaded" });
          await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
        } else {
          await page.waitForTimeout(500);
        }
      }

      if (completed.size === enabledReservations.length) {
        logger.info("모든 예약자가 성공해서 작업을 종료합니다");
        return { status: "completed", completed: [...completed] };
      }

      if (!didWorkInLoop) {
        logger.info("활성화된 예약자가 없어 종료합니다");
        return { status: "no-enabled-reservations" };
      }

      logger.info("재시도 대기", {
        remainingCount: enabledReservations.length - completed.size,
        retryDelayMs: config.schedule.retryDelayMs
      });
      await page.waitForTimeout(config.schedule.retryDelayMs);
      await page.goto(config.site.url, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => undefined);
    }

    logger.warn("시도 가능 시간이 지나서 종료합니다", {
      completedCount: completed.size,
      totalCount: enabledReservations.length,
      completed: [...completed]
    });
    return { status: "window-expired", completed: [...completed] };
  } finally {
    await context.close();
    await browser.close();
  }
}
