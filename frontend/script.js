/* =========================================================
   CIPHER SENTINEL - BULLETPROOF TACTICAL CONTROLLER
========================================================= */

// Auto-detect local vs production cloud domain vs file:// protocol
const API_BASE =
  window.location.origin.includes("127.0.0.1") ||
  window.location.origin.includes("localhost") ||
  window.location.protocol === "file:"
    ? "http://127.0.0.1:8000/api/v1"
    : `${window.location.origin}/api/v1`;

const MAP_CENTER = [23.0305, 72.557];

// DOM Element Bindings
const incidentAmount = document.getElementById("incident-amount");
const incidentId = document.getElementById("incident-id");
const terminalNodeLabel = document.getElementById("terminal-node-label");

const flowVictimCity = document.getElementById("flow-victim-city");
const flowL1City = document.getElementById("flow-l1-city");
const flowL1Bank = document.getElementById("flow-l1-bank");
const flowL2City = document.getElementById("flow-l2-city");
const flowL2Ifsc = document.getElementById("flow-l2-ifsc");
const flowArrowAmt = document.getElementById("flow-arrow-amt");

const sandboxTxnSelect = document.getElementById("sandbox-txn-select");
const sandboxAmount = document.getElementById("sandbox-amount");
const sandboxAmountVal = document.getElementById("sandbox-amount-val");
const sandboxHour = document.getElementById("sandbox-hour");
const sandboxBtn = document.getElementById("sandbox-btn");
const simulateBtn = document.getElementById("simulate-btn");

const targetName = document.getElementById("target-name");
const targetZone = document.getElementById("target-zone");
const targetConfidence = document.getElementById("target-confidence");
const targetFraudProb = document.getElementById("target-fraud-prob");
const targetCash = document.getElementById("target-cash");

const assignedUnit = document.getElementById("assigned-unit");
const interceptDistance = document.getElementById("intercept-distance");
const interceptEta = document.getElementById("intercept-eta");
const dispatchBtn = document.getElementById("dispatch-btn");
const countermeasuresPanel = document.getElementById("countermeasures-panel");
const mapDispatchBanner = document.getElementById("map-dispatch-banner");
const xaiContainer = document.getElementById("xai-bars-container");
const rankList = document.getElementById("rank-list");

const layerRadar = document.getElementById("layer-radar");
const layerDbscan = document.getElementById("layer-dbscan");
const layerCctv = document.getElementById("layer-cctv");

let map = null;
let hotspotLayer = null;
let policeLayer = null;
let vectorLineLayer = null;
let dbscanLayer = null;
let cctvLayer = null;
let currentPredictedSpot = null;
let currentTier = "INTERCEPT";

// 1. Initialize Map Safely (Prevents Re-initialization Crashes)
function initLeafletMap() {
  if (!window.L || map) return;

  try {
    map = L.map("map").setView(MAP_CENTER, 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    hotspotLayer = L.layerGroup().addTo(map);
    policeLayer = L.layerGroup().addTo(map);
    vectorLineLayer = L.layerGroup().addTo(map);
    dbscanLayer = L.layerGroup();
    cctvLayer = L.layerGroup();

    renderPoliceUnits();
  } catch (e) {
    console.warn("Map init warning:", e);
  }
}

function renderPoliceUnits() {
  if (!policeLayer) return;
  policeLayer.clearLayers();

  const units = [
    {
      id: "PCR-04",
      name: "PCR Van 04 (Ellisbridge)",
      lat: 23.028,
      lng: 72.565,
    },
    { id: "PCR-09", name: "PCR Van 09 (Bodakdev)", lat: 23.045, lng: 72.52 },
    {
      id: "PCR-12",
      name: "PCR Van 12 (Navrangpura)",
      lat: 23.036,
      lng: 72.561,
    },
  ];

  units.forEach((unit) => {
    const icon = L.divIcon({
      className: "police-marker",
      html: "🚓",
      iconSize: [26, 26],
      iconAnchor: [13, 13],
    });

    L.marker([unit.lat, unit.lng], { icon })
      .bindPopup(
        `<b style="color:#ffffff;">${unit.name}</b><br><span style="color:#94a3b8;">ID: ${unit.id}</span>`,
      )
      .addTo(policeLayer);
  });
}

// 2. Explainable AI & Corridor Rankings
function renderXAI(xaiFactors) {
  if (!xaiContainer || !Array.isArray(xaiFactors)) return;

  xaiContainer.innerHTML = xaiFactors
    .map(
      (item) => `
      <div class="xai-row">
        <div class="xai-header">
          <span class="xai-label">${item.feature}</span>
          <span class="xai-pct">${item.pct}%</span>
        </div>
        <div class="xai-track">
          <div class="xai-fill" style="width: ${item.pct}%;"></div>
        </div>
      </div>
    `,
    )
    .join("");
}

function renderRanking(ranking) {
  if (!rankList || !Array.isArray(ranking) || ranking.length === 0) return;

  rankList.innerHTML = ranking
    .slice(0, 4)
    .map((item, index) => {
      const name = item.hotspot || "Corridor";
      const prob = Math.round((item.probability ?? 0) * 100);
      return `
        <div class="rank-row">
          <span><b>${index + 1}.</b> ${name}</span>
          <strong>${prob}%</strong>
        </div>
      `;
    })
    .join("");
}

// 3. Reset Dispatch State
function resetDispatchUI() {
  if (vectorLineLayer) vectorLineLayer.clearLayers();
  if (countermeasuresPanel) countermeasuresPanel.style.display = "none";
  if (mapDispatchBanner) mapDispatchBanner.style.display = "none";
  if (dispatchBtn) {
    dispatchBtn.disabled = false;
    dispatchBtn.textContent = "🚨 INITIATE INTERCEPT DISPATCH";
    dispatchBtn.style.background = "";
    dispatchBtn.style.borderColor = "";
    dispatchBtn.style.color = "#ffffff";
  }
}

// 4. Render Hotspots on Radar
function renderHotspots(hotspots, activeAmount = 85000) {
  if (
    !Array.isArray(hotspots) ||
    hotspots.length === 0 ||
    !map ||
    !hotspotLayer
  )
    return;

  resetDispatchUI();
  hotspotLayer.clearLayers();

  currentPredictedSpot =
    hotspots.find((spot) => spot.is_predicted === true) || hotspots[0];

  if (currentPredictedSpot?.ranking)
    renderRanking(currentPredictedSpot.ranking);
  if (currentPredictedSpot?.xai_factors)
    renderXAI(currentPredictedSpot.xai_factors);

  hotspots.forEach((spot) => {
    const lat = Number(spot.latitude);
    const lng = Number(spot.longitude);
    if (Number.isNaN(lat) || Number.isNaN(lng)) return;

    const isPredicted = Boolean(spot.is_predicted);

    const popupHtml = `
      <div style="font-family: monospace;">
        <b style="color: #ffffff; font-size: 12px;">${spot.name} Cash-Out Corridor</b><br>
        <span style="color: #94a3b8;">${spot.area} • Monitored Hub</span><br>
        <span style="color: #64748b;">Nearest Patrol: <b style="color:#ffffff;">${spot.nearest_unit || "PCR-04"}</b></span><br>
        <span style="color: #c084fc;">ETA: <b>${spot.intercept_eta_mins || 4.7} mins</b> (${spot.distance_km || 1.55} km)</span>
      </div>
    `;

    if (isPredicted) {
      L.circle([lat, lng], {
        radius: 650,
        color: "#c084fc",
        weight: 2,
        dashArray: "6, 6",
        fillColor: "#c084fc",
        fillOpacity: 0.05,
      }).addTo(hotspotLayer);
    }

    const marker = L.circleMarker([lat, lng], {
      radius: isPredicted ? 9 : 5,
      color: isPredicted ? "#ffffff" : "#64748b",
      weight: isPredicted ? 2 : 1,
      fillColor: isPredicted ? "#c084fc" : "#1e293b",
      fillOpacity: 1,
    }).addTo(hotspotLayer);

    marker.bindPopup(popupHtml);
    if (isPredicted) marker.openPopup();
  });

  // Hydrate Console Target Metrics
  if (currentPredictedSpot) {
    if (targetName)
      targetName.textContent = `${currentPredictedSpot.name} Banking Corridor`;
    if (targetZone)
      targetZone.textContent = `${currentPredictedSpot.area} • High-Risk ATM Cluster`;
    if (targetConfidence)
      targetConfidence.textContent = `${Math.round((currentPredictedSpot.confidence ?? 0.84) * 100)}%`;
    if (targetFraudProb) {
      const prob = Number(currentPredictedSpot.fraud_prob ?? 0.85);
      targetFraudProb.textContent = `${(prob * 100).toFixed(1)}%`;
    }
    if (targetCash)
      targetCash.textContent = `₹${Number(activeAmount).toLocaleString("en-IN")}`;
    if (assignedUnit)
      assignedUnit.textContent =
        currentPredictedSpot.nearest_unit || "PCR Van 04 (Ellisbridge)";
    if (interceptDistance)
      interceptDistance.textContent = `${currentPredictedSpot.distance_km || 1.55} km`;
    if (interceptEta)
      interceptEta.textContent = `${currentPredictedSpot.intercept_eta_mins || 4.7} mins`;
  }

  try {
    const bounds = L.latLngBounds(
      hotspots.map((s) => [s.latitude, s.longitude]),
    );
    map.fitBounds(bounds.pad(0.2));
  } catch (e) {}
}

// 5. Execution Pipeline (With Graceful Offline Fallback)
async function runTraceAndPredict(
  txnId = "TXN-8492",
  amount = 85000,
  hour = 21,
) {
  try {
    const res = await fetch(`${API_BASE}/trace-predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: txnId,
        amount: Number(amount),
        hour: Number(hour),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // Update 3-Hop Stepper
    if (Array.isArray(data.fund_flow_hops) && data.fund_flow_hops.length >= 3) {
      if (flowVictimCity)
        flowVictimCity.textContent = data.fund_flow_hops[0].location;
      if (flowL1City) flowL1City.textContent = data.fund_flow_hops[1].location;
      if (flowL1Bank) flowL1Bank.textContent = data.fund_flow_hops[1].entity;
      if (flowL2City) flowL2City.textContent = data.fund_flow_hops[2].location;
      if (flowL2Ifsc)
        flowL2Ifsc.textContent = data.terminal_ifsc || "SBIN0001234";
    }

    if (flowArrowAmt) {
      flowArrowAmt.textContent = `──₹${Math.round(Number(amount) / 1000)}k──►`;
    }

    if (incidentId) incidentId.textContent = data.transaction_id;
    if (incidentAmount)
      incidentAmount.textContent = `₹${Number(amount).toLocaleString("en-IN")}`;
    if (terminalNodeLabel)
      terminalNodeLabel.textContent = `${(data.latest_known_node || "Ahmedabad").toUpperCase()} HUB`;

    renderHotspots(data.hotspots, amount);
  } catch (err) {
    console.warn(
      "API offline or unreachable, applying local responsive fallback:",
      err,
    );
    applyOfflineSimulation(txnId, amount, hour);
  }
}

// Fallback logic so UI updates even if local backend is booting
function applyOfflineSimulation(txnId, amount, hour) {
  const isNight = hour >= 23 || hour <= 5;
  const ratio = Math.min(Math.max((amount - 10000) / 140000, 0), 1);
  const simFraud = Math.min(
    Math.max(0.12 + 0.75 * Math.pow(ratio, 0.6) + (isNight ? 0.16 : 0), 0.05),
    0.999,
  );

  const mockHotspots = [
    {
      name: "Ashram Road",
      area: "Ellisbridge",
      latitude: 23.03,
      longitude: 72.58,
      nearest_unit: "PCR Van 04 (Ellisbridge)",
      unit_id: "PCR-04",
      distance_km: 1.55,
      intercept_eta_mins: 4.7,
      is_predicted: txnId !== "TXN-3104" && txnId !== "TXN-9918",
      confidence: 0.76,
      fraud_prob: simFraud,
    },
    {
      name: "CG Road",
      area: "Navrangpura",
      latitude: 23.0225,
      longitude: 72.5714,
      nearest_unit: "PCR Van 12 (Navrangpura)",
      unit_id: "PCR-12",
      distance_km: 0.89,
      intercept_eta_mins: 3.1,
      is_predicted: txnId === "TXN-3104",
      confidence: 0.84,
      fraud_prob: simFraud,
    },
    {
      name: "Prahlad Nagar",
      area: "Corporate Rd",
      latitude: 23.012,
      longitude: 72.51,
      nearest_unit: "PCR Van 09 (Bodakdev)",
      unit_id: "PCR-09",
      distance_km: 2.3,
      intercept_eta_mins: 6.5,
      is_predicted: txnId === "TXN-9918",
      confidence: 0.72,
      fraud_prob: simFraud,
    },
    {
      name: "SG Highway",
      area: "Sindhu Bhavan",
      latitude: 23.07,
      longitude: 72.517,
      nearest_unit: "PCR Van 09 (Bodakdev)",
      unit_id: "PCR-09",
      distance_km: 3.4,
      intercept_eta_mins: 9.1,
      is_predicted: false,
      confidence: 0.65,
      fraud_prob: simFraud,
    },
  ];

  if (flowArrowAmt)
    flowArrowAmt.textContent = `──₹${Math.round(Number(amount) / 1000)}k──►`;
  if (incidentAmount)
    incidentAmount.textContent = `₹${Number(amount).toLocaleString("en-IN")}`;
  renderHotspots(mockHotspots, amount);
}

// 6. Setup All Event Listeners (Registered Immediately)
function setupEventListeners() {
  // Slider real-time updates
  if (sandboxAmount) {
    sandboxAmount.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (sandboxAmountVal)
        sandboxAmountVal.textContent = `₹${val.toLocaleString("en-IN")}`;
    });

    sandboxAmount.addEventListener("change", () => {
      const txnId = sandboxTxnSelect ? sandboxTxnSelect.value : "TXN-8492";
      runTraceAndPredict(
        txnId,
        Number(sandboxAmount.value),
        Number(sandboxHour ? sandboxHour.value : 21),
      );
    });
  }

  if (sandboxHour) {
    sandboxHour.addEventListener("change", () => {
      const txnId = sandboxTxnSelect ? sandboxTxnSelect.value : "TXN-8492";
      runTraceAndPredict(
        txnId,
        Number(sandboxAmount ? sandboxAmount.value : 85000),
        Number(sandboxHour.value),
      );
    });
  }

  // Scenario dropdown
  if (sandboxTxnSelect) {
    sandboxTxnSelect.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected === "TXN-8492") {
        if (sandboxAmount) sandboxAmount.value = "85000";
        if (sandboxHour) sandboxHour.value = "21";
      } else if (selected === "TXN-3104") {
        if (sandboxAmount) sandboxAmount.value = "48500";
        if (sandboxHour) sandboxHour.value = "14";
      } else if (selected === "TXN-9918") {
        if (sandboxAmount) sandboxAmount.value = "120000";
        if (sandboxHour) sandboxHour.value = "2";
      }
      if (sandboxAmountVal && sandboxAmount) {
        sandboxAmountVal.textContent = `₹${Number(sandboxAmount.value).toLocaleString("en-IN")}`;
      }
      runTraceAndPredict(
        selected,
        Number(sandboxAmount.value),
        Number(sandboxHour.value),
      );
    });
  }

  // Manual Trace Button
  if (sandboxBtn) {
    sandboxBtn.addEventListener("click", async () => {
      const txnId = sandboxTxnSelect ? sandboxTxnSelect.value : "TXN-8492";
      const amt = Number(sandboxAmount ? sandboxAmount.value : 85000);
      const hr = Number(sandboxHour ? sandboxHour.value : 21);

      sandboxBtn.textContent = "TRACING FUND FLOW...";
      await runTraceAndPredict(txnId, amt, hr);
      sandboxBtn.textContent = "TRACE & PREDICT EXTRACTION";
    });
  }

  // Tactical Layer Toggles
  if (layerRadar) {
    layerRadar.addEventListener("click", () => {
      layerRadar.classList.toggle("active");
      if (!map) return;
      if (layerRadar.classList.contains("active")) {
        if (hotspotLayer) map.addLayer(hotspotLayer);
        if (policeLayer) map.addLayer(policeLayer);
      } else {
        if (hotspotLayer) map.removeLayer(hotspotLayer);
        if (policeLayer) map.removeLayer(policeLayer);
      }
    });
  }

  if (layerDbscan) {
    layerDbscan.addEventListener("click", () => {
      layerDbscan.classList.toggle("active");
      if (!map || !dbscanLayer) return;
      if (layerDbscan.classList.contains("active")) {
        map.addLayer(dbscanLayer);
      } else {
        map.removeLayer(dbscanLayer);
      }
    });
  }

  if (layerCctv) {
    layerCctv.addEventListener("click", () => {
      layerCctv.classList.toggle("active");
      if (!map || !cctvLayer) return;
      if (layerCctv.classList.contains("active")) {
        map.addLayer(cctvLayer);
      } else {
        map.removeLayer(cctvLayer);
      }
    });
  }

  // Dispatch Button
  if (dispatchBtn) {
    dispatchBtn.addEventListener("click", async () => {
      if (!currentPredictedSpot) return;

      dispatchBtn.disabled = true;
      dispatchBtn.textContent = "TRANSMITTING VECTORS...";

      try {
        await fetch(`${API_BASE}/dispatch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target_name: currentPredictedSpot.name,
            latitude: currentPredictedSpot.latitude,
            longitude: currentPredictedSpot.longitude,
            threat_level: "HIGH",
          }),
        });
      } catch (err) {}

      if (vectorLineLayer && map) {
        vectorLineLayer.clearLayers();
        const patrolCoordsMap = {
          "PCR-04": [23.028, 72.565],
          "PCR-09": [23.045, 72.52],
          "PCR-12": [23.036, 72.561],
        };

        const pcrCoords = patrolCoordsMap[currentPredictedSpot.unit_id] || [
          23.028, 72.565,
        ];
        const targetCoords = [
          currentPredictedSpot.latitude,
          currentPredictedSpot.longitude,
        ];

        const line = L.polyline([pcrCoords, targetCoords], {
          color: "#c084fc",
          weight: 3,
          dashArray: "6, 8",
          opacity: 0.95,
        }).addTo(vectorLineLayer);

        map.fitBounds(line.getBounds().pad(0.3));
      }

      if (countermeasuresPanel) countermeasuresPanel.style.display = "block";
      if (mapDispatchBanner) mapDispatchBanner.style.display = "block";

      dispatchBtn.textContent = "✓ INTERCEPT VECTOR DISPATCHED";
      dispatchBtn.style.background = "rgba(192, 132, 252, 0.25)";
      dispatchBtn.style.borderColor = "#c084fc";
    });
  }

  // Simulate Button
  if (simulateBtn) {
    simulateBtn.addEventListener("click", async () => {
      simulateBtn.disabled = true;
      simulateBtn.textContent = "INGESTING 1930 FEED...";

      const scenarios = ["TXN-8492", "TXN-3104", "TXN-9918"];
      const randomTxn = scenarios[Math.floor(Math.random() * scenarios.length)];
      const newAmount = Math.floor(40000 + Math.random() * 50000);
      const randomHour = [2, 14, 21][Math.floor(Math.random() * 3)];

      if (sandboxTxnSelect) sandboxTxnSelect.value = randomTxn;
      if (sandboxAmount) sandboxAmount.value = String(newAmount);
      if (sandboxAmountVal)
        sandboxAmountVal.textContent = `₹${newAmount.toLocaleString("en-IN")}`;
      if (sandboxHour) sandboxHour.value = String(randomHour);

      await runTraceAndPredict(randomTxn, newAmount, randomHour);
      simulateBtn.textContent = "⚡ INGEST 1930 STREAM";
      simulateBtn.disabled = false;
    });
  }
}

// 7. Initialize Dashboard
function initDashboard() {
  setupEventListeners();
  initLeafletMap();
  runTraceAndPredict();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
