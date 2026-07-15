export async function setActiveSource(hass, source) {
  if (!hass) return;
  await hass.fetchWithAuth("/api/smart_energy_insights/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active_source: source })
  });
}

export async function uploadCsv(hass, file) {
  if (!hass) throw new Error("Home Assistant instance not found");

  const formData = new FormData();
  formData.append("file", file);

  const response = await hass.fetchWithAuth("/api/smart_energy_insights/upload", {
    method: "POST",
    body: formData
  });

  const responseData = await response.json();
  if (!response.ok) {
    throw new Error(responseData.error || `HTTP error! status: ${response.status}`);
  }

  return responseData;
}

function buildRangeQuery(startDate, endDate) {
  const params = new URLSearchParams();
  if (startDate) params.set("start", startDate);
  if (endDate) params.set("end", endDate);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function loadHeatmaps(hass, startDate, endDate, options = {}) {
  if (!hass) return null;

  const response = await hass.fetchWithAuth(`/api/smart_energy_insights/upload${buildRangeQuery(startDate, endDate)}`, {
    method: "GET"
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  if (!data || !data.success) {
    if (options.allowEmpty !== false) return null;
    throw new Error(data && data.error ? data.error : "No data available");
  }

  return data;
}

export async function loadSensorData(hass, entityId, startDate, endDate, options = {}) {
  if (!hass) return null;
  const response = await hass.fetchWithAuth("/api/smart_energy_insights/sensor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entity_id: entityId,
      start: startDate || null,
      end: endDate || null
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP error! status: ${response.status}`);
  }

  if (!data || !data.success) {
    if (options.allowEmpty !== false) return null;
    throw new Error(data && data.error ? data.error : "No data available");
  }

  return data;
}
