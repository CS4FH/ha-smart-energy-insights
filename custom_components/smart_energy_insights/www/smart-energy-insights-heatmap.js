export function generateHeatmapHTML(data, title, unit, reverseColors, formatNumber, legendLabels, fixedScale, options) {
  if (!data || data.length === 0) return "";
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const flatData = data.flat().filter((value) => Number.isFinite(value));
  const heatmapOptions = options || {};

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

  let html = `
    <div class="heatmap-section">
      <div class="heatmap-title">${title}</div>
      <div class="heatmap-legend">
        <span class="heatmap-legend-value">${formatNumber(min, 2)} ${unit}</span>
        <span>${legendLow}</span>
        <div class="heatmap-legend-bar"></div>
        ${legendCenter ? `<span>${legendCenter}</span>` : ""}
        <span>${legendHigh}</span>
        <span class="heatmap-legend-value">${formatNumber(max, 2)} ${unit}</span>
      </div>
      <div class="heatmap-info-note${infoText.trim() ? "" : " is-empty"}"><span class="heatmap-info-badge">i</span><span>${infoText}</span></div>
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
      const bgColor = `hsla(${hue}, 85%, ${lightness}%, ${alpha})`;
      const tooltip = `${days[d]} ${h}:00 Uhr\n${formatNumber(val, 2)} ${unit}`;
      html += `<div class="heatmap-cell" style="background-color: ${bgColor}" title="${tooltip}"></div>`;
    }
  }

  html += "</div></div>";
  return html;
}
