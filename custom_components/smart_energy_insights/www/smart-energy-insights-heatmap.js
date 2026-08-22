export function generateHeatmapHTML(data, title, unit, reverseColors, formatNumber, legendLabels, fixedScale, options) {
  if (!data || data.length === 0) return "";
  const flatData = data.flat().filter((value) => Number.isFinite(value));
  const heatmapOptions = options || {};
  const escapeHtml = (value) => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
  const days = Array.isArray(heatmapOptions.dayLabels) && heatmapOptions.dayLabels.length === 7
    ? heatmapOptions.dayLabels
    : ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

  let min;
  let max;
  let center = null;
  if (fixedScale && Number.isFinite(fixedScale.min) && Number.isFinite(fixedScale.max) && fixedScale.max > fixedScale.min) {
    min = fixedScale.min;
    max = fixedScale.max;
    if (Number.isFinite(fixedScale.center)) {
      center = Math.max(min, Math.min(max, fixedScale.center));
    }
  } else {
    const sortedData = flatData.slice().sort((a, b) => a - b);
    const minIdx = Math.floor(sortedData.length * 0.02);
    const maxIdx = Math.floor(sortedData.length * 0.98);
    min = sortedData[minIdx] ?? 0;
    max = sortedData[maxIdx] ?? min;
  }
  const range = max - min === 0 ? 1 : max - min;

  const legendLow = legendLabels && legendLabels.low ? legendLabels.low : "Low";
  const legendCenter = legendLabels && legendLabels.center ? legendLabels.center : null;
  const legendHigh = legendLabels && legendLabels.high ? legendLabels.high : "High";
  const infoText = heatmapOptions.infoText || " ";
  const hideValueExtremes = heatmapOptions.hideValueExtremes === true;
  const colorMode = heatmapOptions.colorMode || "default";
  const legendBarStyle = heatmapOptions.legendBarStyle ? ` style="${heatmapOptions.legendBarStyle}"` : "";

  let html = `
    <div class="heatmap-section">
      <div class="heatmap-header">
        <div class="heatmap-title-row">
          <div class="heatmap-title">${escapeHtml(title)}</div>
          ${infoText.trim() ? `<span class="metric-info-marker" role="img" tabindex="0" aria-label="${escapeHtml(infoText)}" title="${escapeHtml(infoText)}"><ha-icon icon="mdi:information-outline"></ha-icon></span>` : ""}
        </div>
        <div class="heatmap-legend">
          ${hideValueExtremes ? "" : `<span class="heatmap-legend-value">${formatNumber(min, 2)} ${unit}</span>`}
          <span>${legendLow}</span>
          <div class="heatmap-legend-bar"${legendBarStyle}></div>
          ${legendCenter ? `<span>${legendCenter}</span>` : ""}
          <span>${legendHigh}</span>
          ${hideValueExtremes ? "" : `<span class="heatmap-legend-value">${formatNumber(max, 2)} ${unit}</span>`}
        </div>
      </div>
      <div class="heatmap-grid">
        <div></div>
  `;

  for (let h = 0; h < 24; h += 1) {
    html += `<div class="heatmap-header-x">${h}</div>`;
  }

  for (let d = 0; d < 7; d += 1) {
    html += `<div class="heatmap-header-y">${days[d]}</div>`;
    for (let h = 0; h < 24; h += 1) {
      const val = data[d][h] || 0;
      const clampedVal = Math.max(min, Math.min(max, val));
      let intensity = (clampedVal - min) / range;
      intensity = Math.pow(intensity, 0.85);

      let bgColor;
      if (colorMode === "optimization") {
        const neutralThreshold = (Math.max(Math.abs(min), Math.abs(max)) || 1) * 0.02;
        if (Math.abs(clampedVal) <= neutralThreshold) {
          bgColor = "hsla(215, 10%, 18%, 0.45)";
        } else if (clampedVal < 0) {
          const redRange = Math.abs(min) || 1;
          const redIntensity = Math.pow(Math.max(0, Math.min(1, Math.abs(clampedVal) / redRange)), 0.9);
          const saturation = 58 + redIntensity * 30;
          const lightness = 22 + redIntensity * 22;
          const alpha = 0.55 + redIntensity * 0.4;
          bgColor = `hsla(6, ${saturation}%, ${lightness}%, ${alpha})`;
        } else {
          const greenRange = max || 1;
          const greenIntensity = Math.pow(Math.max(0, Math.min(1, clampedVal / greenRange)), 0.9);
          const saturation = 44 + greenIntensity * 30;
          const lightness = 22 + greenIntensity * 20;
          const alpha = 0.55 + greenIntensity * 0.4;
          bgColor = `hsla(135, ${saturation}%, ${lightness}%, ${alpha})`;
        }
      } else {
        let hue;
        if (Number.isFinite(center)) {
          if (clampedVal <= center) {
            const lowerRange = center - min || 1;
            const t = Math.max(0, Math.min(1, (clampedVal - min) / lowerRange));
            hue = 120 - (120 - 35) * t;
          } else {
            const upperRange = max - center || 1;
            const t = Math.max(0, Math.min(1, (clampedVal - center) / upperRange));
            hue = 35 * (1 - t);
          }
        } else {
          hue = reverseColors ? intensity * 120 : (1 - intensity) * 120;
        }

        const lightness = 45 + 15 * (1 - Math.abs(intensity - 0.5) * 2);
        const alpha = val === 0 ? 0.1 : 1;
        bgColor = `hsla(${hue}, 85%, ${lightness}%, ${alpha})`;
      }

      let tooltip;
      if (typeof heatmapOptions.tooltipFormatter === "function") {
        tooltip = heatmapOptions.tooltipFormatter(val, days[d], h);
      } else {
        const absoluteValue = Math.abs(val);
        const formattedValue = absoluteValue > 0 && absoluteValue < 0.01
          ? (val > 0 ? "<0,01" : ">-0,01")
          : formatNumber(val, 2);
        tooltip = `${days[d]} ${h}:00 Uhr\n${formattedValue} ${unit}`;
      }

      html += `<div class="heatmap-cell" style="background-color: ${bgColor}" title="${escapeHtml(tooltip)}"></div>`;
    }
  }

  html += `</div></div>`;
  return html;
}
