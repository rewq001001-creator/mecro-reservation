import fs from "node:fs";
import path from "node:path";

const CONFIG_PATH = path.resolve(process.cwd(), "config", "reservations.json");

function getDateKey(timeZone, now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function applyDateOverrides(config) {
  const dateKey = getDateKey(config.timezone ?? "Asia/Seoul");
  const override = config.dateOverrides?.[dateKey];

  if (!override) {
    return config;
  }

  const reservations = config.reservations.map((reservation) => {
    const reservationOverride = override.reservations?.find((item) => item.label === reservation.label);
    return reservationOverride ? { ...reservation, ...reservationOverride } : reservation;
  });

  return {
    ...config,
    site: override.site ? { ...config.site, ...override.site } : config.site,
    schedule: override.schedule ? { ...config.schedule, ...override.schedule } : config.schedule,
    reservations
  };
}

export function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, "utf8");
  return applyDateOverrides(JSON.parse(raw));
}

export function getConfigPath() {
  return CONFIG_PATH;
}
