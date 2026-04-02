function getDateParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function parseMinutes(value) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function getScheduleWindowStatus(schedule, timeZone, now = new Date()) {
  const parts = getDateParts(now, timeZone);
  const minutes = parts.hour * 60 + parts.minute;
  const startMinutes = parseMinutes(schedule.startTime);
  const endMinutes = parseMinutes(schedule.endTime);
  const isWeekend = parts.weekday === "Sat" || parts.weekday === "Sun";
  const withinWindow = minutes >= startMinutes && minutes <= endMinutes;

  return {
    ...parts,
    isWeekend,
    withinWindow,
    startMinutes,
    endMinutes
  };
}
