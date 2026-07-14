export function generateHeatmapHTML(data, title, unit, reverseColors, formatNumber, legendLabels) {
  if (!data || data.length === 0) return "";
  const days = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const flatData = data.flat();

  const sortedData = flatData.slice().sort((a, b) => a - b);
  const minIdx = Math.floor(sortedData.length * 0.02);
  const maxIdx = Math.floor(sortedData.length * 0.98);
  const min = sortedData[minIdx];
  const max = sortedData[maxIdx];
  const range = max - min === 0 ? 1 : max - min;

  const legendLow = legendLabels && legendLabels.low ? legendLabels.low : "Low";
  const legendHigh = legendLabels && legendLabels.high ? legendLabels.high : "High";

  let html = `
    <div class="heatmap-section">
      <div class="heatmap-title">${title}</div>
      <div class="heatmap-legend">
        <span class="heatmap-legend-value">${formatNumber(min, 2)} ${unit}</span>
        <span>${legendLow}</span>
        <div class="heatmap-legend-bar"></div>
        <span>${legendHigh}</span>
        <span class="heatmap-legend-value">${formatNumber(max, 2)} ${unit}</span>
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
      const hue = reverseColors ? intensity * 120 : (1 - intensity) * 120;
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
