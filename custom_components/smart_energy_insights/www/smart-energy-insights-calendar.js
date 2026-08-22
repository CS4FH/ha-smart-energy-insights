function monthParts(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ""));
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) };
}

export function shiftCalendarMonth(monthKey, offset) {
  const parts = monthParts(monthKey);
  if (!parts) return monthKey;
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1 + offset, 1));
  return shifted.toISOString().slice(0, 7);
}

function buildMonthDates(monthKey) {
  const parts = monthParts(monthKey);
  if (!parts) return [];
  const first = new Date(Date.UTC(parts.year, parts.month - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(gridStart);
    current.setUTCDate(gridStart.getUTCDate() + index);
    return {
      date: current.toISOString().slice(0, 10),
      day: current.getUTCDate(),
      inMonth: current.getUTCMonth() === parts.month - 1,
    };
  });
}

function isInRange(date, start, end) {
  return Boolean(start && end && date >= start && date <= end);
}

function formatDateEuropean(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "");
}

export function buildDayRangePickerHtml({
  texts,
  locale,
  coverage,
  availableStartDate,
  availableEndDate,
  viewMonth,
  draftStart,
  draftEnd,
  appliedStart,
  appliedEnd,
  calendarOpen,
  isLoading,
  errorMessage,
}) {
  const resolvedCoverage = coverage && typeof coverage === "object" ? coverage : {};
  const resolvedMonth = viewMonth || availableEndDate?.slice(0, 7) || availableStartDate?.slice(0, 7);
  const parts = monthParts(resolvedMonth);
  if (!parts) return "";

  const monthLabel = new Intl.DateTimeFormat(locale || undefined, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, 1)));
  const previousMonth = shiftCalendarMonth(resolvedMonth, -1);
  const nextMonth = shiftCalendarMonth(resolvedMonth, 1);
  const firstAvailableMonth = availableStartDate?.slice(0, 7) || resolvedMonth;
  const lastAvailableMonth = availableEndDate?.slice(0, 7) || resolvedMonth;
  const summaryStart = appliedStart || availableStartDate;
  const summaryEnd = appliedEnd || availableEndDate;
  const summary = summaryStart && summaryEnd
    ? `${formatDateEuropean(summaryStart)} - ${formatDateEuropean(summaryEnd)}`
    : "";

  const days = buildMonthDates(resolvedMonth).map(({ date, day, inMonth }) => {
    const dayCoverage = resolvedCoverage[date];
    const status = dayCoverage?.status === "complete" ? "complete" : dayCoverage ? "partial" : "none";
    const selectable = inMonth && status !== "none";
    const classes = ["range-calendar-day", status];
    if (!inMonth) classes.push("outside-month");
    if (isInRange(date, draftStart, draftEnd)) classes.push("in-range");
    if (date === draftStart) classes.push("range-start");
    if (date === draftEnd) classes.push("range-end");
    const statusText = status === "complete"
      ? texts.calendarStatusComplete
      : status === "partial"
        ? texts.calendarStatusPartial
        : texts.calendarStatusNone;
    return `
      <button
        type="button"
        class="${classes.join(" ")}"
        data-calendar-day="${date}"
        aria-label="${date}: ${statusText}"
        title="${statusText}"
        ${selectable ? "" : "disabled"}
      >
        <span class="range-calendar-day-number">${day}</span>
        <span class="range-calendar-day-status" aria-hidden="true"></span>
      </button>
    `;
  }).join("");

  return `
    <details class="range-calendar"${calendarOpen ? " open" : ""}>
      <summary class="shared-island-summary range-calendar-summary" aria-label="${texts.calendarTitle}">
        <span class="workflow-step-marker" aria-hidden="true">02</span>
        <span class="range-calendar-heading">
          <span class="shared-island-summary-text">${texts.calendarTitle}</span>
          <strong>${summary}</strong>
        </span>
        <span class="shared-island-summary-hint closed">${texts.sourceClosedHint}</span>
        <span class="shared-island-summary-hint open">${texts.sourceOpenHint}</span>
        <span class="shared-island-summary-icon" aria-hidden="true"></span>
      </summary>
      <div class="range-calendar-panel">
        <div class="range-calendar-navigation">
          <button type="button" class="range-calendar-icon-button" data-calendar-shift="-1" aria-label="${texts.calendarPreviousMonth}" ${previousMonth < firstAvailableMonth ? "disabled" : ""}><ha-icon icon="mdi:chevron-left"></ha-icon></button>
          <div class="range-calendar-month">${monthLabel}</div>
          <button type="button" class="range-calendar-icon-button" data-calendar-shift="1" aria-label="${texts.calendarNextMonth}" ${nextMonth > lastAvailableMonth ? "disabled" : ""}><ha-icon icon="mdi:chevron-right"></ha-icon></button>
        </div>
        <div class="range-calendar-weekdays" aria-hidden="true">
          ${texts.calendarWeekdays.map((label) => `<span>${label}</span>`).join("")}
        </div>
        <div class="range-calendar-grid">${days}</div>
        <div class="range-calendar-legend">
          <span><i class="complete"></i>${texts.calendarStatusComplete}</span>
          <span><i class="partial"></i>${texts.calendarStatusPartial}</span>
          <span><i class="none"></i>${texts.calendarStatusNone}</span>
        </div>
        <div class="range-calendar-message" id="rangeCalendarMessage" role="status">${errorMessage || ""}</div>
        <div class="range-calendar-actions">
          <button type="button" class="secondary-button" data-calendar-reset ${isLoading ? "disabled" : ""}>${texts.calendarReset}</button>
          <button type="button" class="primary-button" data-calendar-apply ${draftStart && draftEnd && !isLoading ? "" : "disabled"}>${isLoading ? texts.calendarLoading : texts.calendarApply}</button>
        </div>
      </div>
    </details>
  `;
}