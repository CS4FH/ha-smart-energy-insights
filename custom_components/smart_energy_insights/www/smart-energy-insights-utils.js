export function debounce(func, wait) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function formatNumber(value, decimals) {
  const num = Number(value);
  return !Number.isFinite(num) ? "N/A" : num.toFixed(decimals).replace(".", ",");
}

export function formatUploadDate(uploadDate, fallbackLabel) {
  if (!uploadDate) return fallbackLabel;

  const date = new Date(uploadDate);
  if (Number.isNaN(date.getTime())) return fallbackLabel;

  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
