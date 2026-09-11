/* =========================================================
   CIPHER SENTINEL - TACTICAL DISPATCH CONTROLLER
========================================================= */

const API_BASE =
  window.location.origin.includes("127.0.0.1") ||
  window.location.origin.includes("localhost") ||
  window.location.protocol === "file:"
    ? "http://127.0.0.1:8000/api/v1"
    : `${window.location.origin}/api/v1`;

const MAP_CENTER = [23.0305, 72.557];

// Embedded Tactical Data
const EMBEDDED_DBSCAN = [
  {
    lat: 23.03,
    lng: 72.58,
    density: 0.94,
    name: "Ashram Rd Financial Cluster",
  },
  { lat: 23.0325, lng: 72.578, density: 0.88, name: "Ellisbridge Hub" },
  { lat: 23.028, lng: 72.582, density: 0.82, name: "VS Cross Corridor" },
  { lat: 23.0225, lng: 72.5714, density: 0.91, name: "CG Road Axis" },
  { lat: 23.025, lng: 72.569, density: 0.79, name: "Navrangpura Swastik Jn" },
  { lat: 23.012, lng: 72.51, density: 0.85, name: "Prahlad Nagar Commercial" },
  { lat: 23.0145, lng: 72.513, density: 0.72, name: "Corporate Rd Hub" },
  { lat: 23.07, lng: 72.517, density: 0.87, name: "SG Highway Axis" },
  { lat: 23.068, lng: 72.515, density: 0.76, name: "Sindhu Bhavan Jn" },
];

const EMBEDDED_CCTV = [
  {
    cam_id: "CAM-AHM-101",
    name: "Ashram Rd / Ellisbridge Jn",
    lat: 23.0295,
    lng: 72.579,
    status: "ONLINE - BUFFER LOCKED",
  },
  {
    cam_id: "CAM-AHM-102",
    name: "Ashram Rd / VS Cross",
    lat: 23.026,
    lng: 72.578,
    status: "ONLINE - BUFFER LOCKED",
  },
  {
    cam_id: "CAM-AHM-103",
    name: "CG Rd / Swastik Cross",
    lat: 23.033,
    lng: 72.562,
    status: "ONLINE - BUFFER LOCKED",
  },
  {
    cam_id: "CAM-AHM-104",
    name: "CG Rd / Panchvati Circle",
    lat: 23.021,
    lng: 72.568,
    status: "ONLINE - BUFFER LOCKED",
  },
  {
    cam_id: "CAM-AHM-105",
    name: "Prahlad Nagar Garden Jn",
    lat: 23.011,
    lng: 72.508,
    status: "ONLINE - BUFFER LOCKED",
  },
  {
    cam_id: "CAM-AHM-106",
    name: "SG Highway / Pakwan Cross",
    lat: 23.048,
    lng: 72.518,
    status: "ONLINE - BUFFER LOCKED",
  },
];

function getElement(id, textFallback = null) {
  const el = document.getElementById(id);
  if (el) return el;
  if (textFallback) {
    const all = document.querySelectorAll("button, span, div, a");
    for (const item of all) {
      if (item.textContent.toLowerCase().includes(textFallback.toLowerCase())) {
        return item;
      }
    }
  }
  return null;
}

let map = null;
let hotspotLayer = null;
let policeLayer = null;
let vectorLineLayer = null;
let dbscanLayer = null;
let cctvLayer = null;
let currentPredictedSpot = null;

// Initialize Map
function initLeafletMap() {
  if (!window.L || map) return;

  try {
    map = L.map("map", { zoomControl: false }).setView(MAP_CENTER, 13);
    L.control.zoom({ position: "topleft" }).addTo(map);

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
    populateTacticalLayers();

    const controls = document.querySelector(".map-controls");
    if (controls && window.L && L.DomEvent) {
      L.DomEvent.disableClickPropagation(controls);
      L.DomEvent.disableScrollPropagation(controls);
    }
  } catch (e) {
    console.error("Map initialization error:", e);
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
      className: "police-marker-custom",
      html: `<div style="background:#090d16; border:2px solid #c084fc; border-radius:6px; width:28px; height:28px; display:flex; align-items:center; justify-content:center; font-size:14px; box-shadow:0 0 10px rgba(192,132,252,0.5);">🚓</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    L.marker([unit.lat, unit.lng], { icon })
      .bindPopup(
        `<b style="color:#ffffff;">${unit.name}</b><br><span style="color:#94a3b8;">ID: ${unit.id}</span>`,
      )
      .addTo(policeLayer);
  });
}

function populateTacticalLayers() {
  if (dbscanLayer) {
    dbscanLayer.clearLayers();
    EMBEDDED_DBSCAN.forEach((pt) => {
      L.circleMarker([pt.lat, pt.lng], {
        radius: 14,
        color: "#38bdf8",
        fillColor: "#38bdf8",
        fillOpacity: 0.2,
        weight: 1,
      }).addTo(dbscanLayer);

      L.circleMarker([pt.lat, pt.lng], {
        radius: 6,
        color: "#ffffff",
        fillColor: "#0284c7",
        fillOpacity: 0.9,
        weight: 2,
      })
        .bindPopup(
          `<b>${pt.name}</b><br>DBSCAN Concentration: <b>${(pt.density * 100).toFixed(0)}%</b>`,
        )
        .addTo(dbscanLayer);
    });
  }

  if (cctvLayer) {
    cctvLayer.clearLayers();
    EMBEDDED_CCTV.forEach((cam) => {
      const icon = L.divIcon({
        className: "cctv-marker-custom",
        html: `<div style="background:#0f172a; border:2px solid #38bdf8; border-radius:6px; width:26px; height:26px; display:flex; align-items:center; justify-content:center; font-size:13px; box-shadow:0 0 8px rgba(56,189,248,0.6);">📹</div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 13],
      });

      L.marker([cam.lat, cam.lng], { icon })
        .bindPopup(
          `<b>${cam.name}</b><br>Camera ID: <code>${cam.cam_id}</code><br><span style="color:#34d399; font-weight:bold;">${cam.status}</span>`,
        )
        .addTo(cctvLayer);
    });
  }
}

// Render Explainable Risk Factors
function renderXAI(xaiFactors) {
  const container = getElement("xai-bars-container");
  if (!container || !Array.isArray(xaiFactors)) return;

  container.innerHTML = xaiFactors
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
  const list = getElement("rank-list");
  if (!list || !Array.isArray(ranking) || ranking.length === 0) return;

  list.innerHTML = ranking
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

// Render Hotspots & Update Console
function renderHotspots(hotspots, activeAmount = 85000) {
  if (
    !Array.isArray(hotspots) ||
    hotspots.length === 0 ||
    !map ||
    !hotspotLayer
  )
    return;

  if (vectorLineLayer) vectorLineLayer.clearLayers();
  const cmPanel = getElement("countermeasures-panel");
  const banner = getElement("map-dispatch-banner");
  const dispatchBtn = getElement("dispatch-btn");

  if (cmPanel) cmPanel.style.display = "none";
  if (banner) banner.style.display = "none";
  if (dispatchBtn) {
    dispatchBtn.disabled = false;
    dispatchBtn.textContent = "🚨 INITIATE INTERCEPT DISPATCH";
    dispatchBtn.style.background = "";
    dispatchBtn.style.borderColor = "";
  }

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
        <b style="color: #ffffff; font-size: 13px;">${spot.name} Cash-Out Corridor</b><br>
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
        fillOpacity: 0.08,
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
  const targetName = getElement("target-name");
  const targetZone = getElement("target-zone");
  const targetConf = getElement("target-confidence");
  const targetFraud = getElement("target-fraud-prob");
  const targetCash = getElement("target-cash");
  const assignedUnit = getElement("assigned-unit");
  const interceptDist = getElement("intercept-distance");
  const interceptEta = getElement("intercept-eta");

  if (targetName)
    targetName.textContent = `${currentPredictedSpot.name} Banking Corridor`;
  if (targetZone)
    targetZone.textContent = `${currentPredictedSpot.area} • High-Risk ATM Cluster`;
  if (targetConf)
    targetConf.textContent = `${Math.round((currentPredictedSpot.confidence ?? 0.84) * 100)}%`;
  if (targetFraud) {
    const prob = Number(currentPredictedSpot.fraud_prob ?? 0.85);
    targetFraud.textContent = `${(prob * 100).toFixed(1)}%`;
  }
  if (targetCash)
    targetCash.textContent = `₹${Number(activeAmount).toLocaleString("en-IN")}`;
  if (assignedUnit)
    assignedUnit.textContent =
      currentPredictedSpot.nearest_unit || "PCR Van 04 (Ellisbridge)";
  if (interceptDist)
    interceptDist.textContent = `${currentPredictedSpot.distance_km || 1.55} km`;
  if (interceptEta)
    interceptEta.textContent = `${currentPredictedSpot.intercept_eta_mins || 4.7} mins`;

  // Dynamic Triage Badge
  const triageBadge = getElement("triage-badge");
  const triageReason = getElement("triage-reason");
  const probVal = Number(currentPredictedSpot.fraud_prob ?? 0.85);
  const confVal = Number(currentPredictedSpot.confidence ?? 0.84);
  const etaVal = Number(currentPredictedSpot.intercept_eta_mins ?? 4.7);

  if (triageBadge) {
    if (probVal >= 0.78 && confVal >= 0.65 && etaVal <= 10.0) {
      triageBadge.textContent = "🔴 TACTICAL INTERCEPT (P1)";
      triageBadge.className = "triage-badge p1";
      if (triageReason)
        triageReason.textContent =
          "High fraud severity & corridor signal. Patrol vector authorized.";
    } else if (probVal >= 0.45) {
      triageBadge.textContent = "🟡 ENHANCED SURVEILLANCE (P2)";
      triageBadge.className = "triage-badge p2";
      if (triageReason)
        triageReason.textContent =
          "Moderate risk. Locking CCTV junctions & issuing ATM friction.";
    } else {
      triageBadge.textContent = "🟢 PASSIVE MONITORING (P3)";
      triageBadge.className = "triage-badge p3";
      if (triageReason)
        triageReason.textContent =
          "Telemetry within normal bounds. Zero patrol mobilization.";
    }
  }

  try {
    const bounds = L.latLngBounds(
      hotspots.map((s) => [s.latitude, s.longitude]),
    );
    map.fitBounds(bounds.pad(0.2));
  } catch (e) {}
}

// Fund Flow Trace & Prediction Pipeline
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

    const victimCity = getElement("flow-victim-city");
    const l1City = getElement("flow-l1-city");
    const l1Bank = getElement("flow-l1-bank");
    const l2City = getElement("flow-l2-city");
    const l2Ifsc = getElement("flow-l2-ifsc");
    const flowArrow = getElement("flow-arrow-amt");

    if (Array.isArray(data.fund_flow_hops) && data.fund_flow_hops.length >= 3) {
      if (victimCity) victimCity.textContent = data.fund_flow_hops[0].location;
      if (l1City) l1City.textContent = data.fund_flow_hops[1].location;
      if (l1Bank) l1Bank.textContent = data.fund_flow_hops[1].entity;
      if (l2City) l2City.textContent = data.fund_flow_hops[2].location;
      if (l2Ifsc) l2Ifsc.textContent = data.terminal_ifsc || "SBIN0001234";
    }

    if (flowArrow)
      flowArrow.textContent = `──₹${Math.round(Number(amount) / 1000)}k──►`;
    const incId = getElement("incident-id");
    const incAmt = getElement("incident-amount");
    const nodeLabel = getElement("terminal-node-label");

    if (incId) incId.textContent = data.transaction_id;
    if (incAmt)
      incAmt.textContent = `₹${Number(amount).toLocaleString("en-IN")}`;
    if (nodeLabel)
      nodeLabel.textContent = `${(data.latest_known_node || "Ahmedabad").toUpperCase()} HUB`;

    renderHotspots(data.hotspots, amount);
  } catch (err) {
    applyOfflineSimulation(txnId, amount, hour);
  }
}

function applyOfflineSimulation(txnId, amount, hour) {
  const isNight = hour >= 23 || hour <= 5;
  const isEvening = hour >= 19 && hour < 23;
  const ratio = Math.min(Math.max((amount - 10000) / 140000, 0), 1);
  const simFraud = Math.min(
    Math.max(
      0.12 +
        0.75 * Math.pow(ratio, 0.6) +
        (isNight ? 0.16 : isEvening ? 0.08 : 0),
      0.05,
    ),
    0.999,
  );

  let targetCorridor = "Ashram Road";
  if (txnId === "TXN-3104") targetCorridor = "CG Road";
  else if (txnId === "TXN-9918") targetCorridor = "Prahlad Nagar";
  else if (amount > 100000 || isNight) targetCorridor = "SG Highway";

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
      is_predicted: targetCorridor === "Ashram Road",
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
      is_predicted: targetCorridor === "CG Road",
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
      is_predicted: targetCorridor === "Prahlad Nagar",
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
      is_predicted: targetCorridor === "SG Highway",
      confidence: 0.65,
      fraud_prob: simFraud,
    },
  ];

  const flowArrow = getElement("flow-arrow-amt");
  const incAmt = getElement("incident-amount");
  if (flowArrow)
    flowArrow.textContent = `──₹${Math.round(Number(amount) / 1000)}k──►`;
  if (incAmt) incAmt.textContent = `₹${Number(amount).toLocaleString("en-IN")}`;
  renderHotspots(mockHotspots, amount);
}

// Interactive Handlers: ONLY trace when button is explicitly clicked
function setupEventListeners() {
  const sbAmount = getElement("sandbox-amount");
  const sbAmountVal = getElement("sandbox-amount-val");
  const sbHour = getElement("sandbox-hour");
  const sbTxn = getElement("sandbox-txn-select");
  const sbBtn = getElement("sandbox-btn", "TRACE");
  const simBtn = getElement("simulate-btn", "INGEST");
  const dispatchBtn = getElement("dispatch-btn", "DISPATCH");

  function promptTraceExecution() {
    if (sbBtn) {
      sbBtn.style.boxShadow = "0 0 14px rgba(192, 132, 252, 0.6)";
      sbBtn.style.borderColor = "#c084fc";
    }
  }

  // Slider updates display value ONLY (NO AUTO PREDICT)
  if (sbAmount) {
    sbAmount.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      if (sbAmountVal)
        sbAmountVal.textContent = `₹${val.toLocaleString("en-IN")}`;
      promptTraceExecution();
    });
  }

  if (sbHour) {
    sbHour.addEventListener("change", () => {
      promptTraceExecution();
    });
  }

  // Scenario dropdown updates input defaults ONLY (NO AUTO PREDICT)
  if (sbTxn) {
    sbTxn.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected === "TXN-8492") {
        if (sbAmount) sbAmount.value = "85000";
        if (sbHour) sbHour.value = "21";
      } else if (selected === "TXN-3104") {
        if (sbAmount) sbAmount.value = "48500";
        if (sbHour) sbHour.value = "14";
      } else if (selected === "TXN-9918") {
        if (sbAmount) sbAmount.value = "120000";
        if (sbHour) sbHour.value = "2";
      }
      if (sbAmountVal && sbAmount) {
        sbAmountVal.textContent = `₹${Number(sbAmount.value).toLocaleString("en-IN")}`;
      }
      promptTraceExecution();
    });
  }

  // --- THE PRIMARY EXECUTION BUTTON ---
  // Predictions and map updates ONLY run when this button is clicked
  if (sbBtn) {
    sbBtn.addEventListener("click", async () => {
      const txnId = sbTxn ? sbTxn.value : "TXN-8492";
      const amt = Number(sbAmount ? sbAmount.value : 85000);
      const hr = Number(sbHour ? sbHour.value : 21);

      sbBtn.disabled = true;
      sbBtn.textContent = "TRACING FUND-FLOW GRAPH...";
      sbBtn.style.boxShadow = "";

      // Artificial 350ms delay for crisp UI state transition
      await new Promise((resolve) => setTimeout(resolve, 350));
      await runTraceAndPredict(txnId, amt, hr);

      sbBtn.textContent = "TRACE & PREDICT EXTRACTION";
      sbBtn.disabled = false;
    });
  }

  // Layer Toggles
  const layerRadar = getElement("layer-radar", "RADAR");
  const layerDbscan = getElement("layer-dbscan", "DBSCAN");
  const layerCctv = getElement("layer-cctv", "CCTV");

  if (layerRadar) {
    layerRadar.addEventListener("click", (e) => {
      e.stopPropagation();
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
    layerDbscan.addEventListener("click", (e) => {
      e.stopPropagation();
      layerDbscan.classList.toggle("active");
      if (!map || !dbscanLayer) return;

      if (layerDbscan.classList.contains("active")) {
        map.addLayer(dbscanLayer);
        layerDbscan.style.borderColor = "#38bdf8";
        layerDbscan.style.color = "#38bdf8";
      } else {
        map.removeLayer(dbscanLayer);
        layerDbscan.style.borderColor = "";
        layerDbscan.style.color = "";
      }
    });
  }

  if (layerCctv) {
    layerCctv.addEventListener("click", (e) => {
      e.stopPropagation();
      layerCctv.classList.toggle("active");
      if (!map || !cctvLayer) return;

      if (layerCctv.classList.contains("active")) {
        map.addLayer(cctvLayer);
        layerCctv.style.borderColor = "#38bdf8";
        layerCctv.style.color = "#38bdf8";
      } else {
        map.removeLayer(cctvLayer);
        layerCctv.style.borderColor = "";
        layerCctv.style.color = "";
      }
    });
  }

  // Intercept Dispatch
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

      const cmPanel = getElement("countermeasures-panel");
      const banner = getElement("map-dispatch-banner");
      if (cmPanel) cmPanel.style.display = "block";
      if (banner) banner.style.display = "block";

      dispatchBtn.textContent = "✓ INTERCEPT VECTOR DISPATCHED";
      dispatchBtn.style.background = "rgba(192, 132, 252, 0.25)";
      dispatchBtn.style.borderColor = "#c084fc";
    });
  }

  // Ingest NCRP 1930 Feed Simulation
  if (simBtn) {
    simBtn.addEventListener("click", async () => {
      simBtn.disabled = true;
      simBtn.textContent = "INGESTING 1930 FEED...";

      const scenarios = ["TXN-8492", "TXN-3104", "TXN-9918"];
      const randomTxn = scenarios[Math.floor(Math.random() * scenarios.length)];
      const newAmount = Math.floor(40000 + Math.random() * 50000);
      const randomHour = [2, 14, 21][Math.floor(Math.random() * 3)];

      if (sbTxn) sbTxn.value = randomTxn;
      if (sbAmount) sbAmount.value = String(newAmount);
      if (sbAmountVal)
        sbAmountVal.textContent = `₹${newAmount.toLocaleString("en-IN")}`;
      if (sbHour) sbHour.value = String(randomHour);

      await runTraceAndPredict(randomTxn, newAmount, randomHour);
      simBtn.textContent = "⚡ INGEST 1930 STREAM";
      simBtn.disabled = false;
    });
  }
}

// Boot
function initDashboard() {
  initLeafletMap();
  setupEventListeners();
  // Loads initial baseline scenario on startup
  runTraceAndPredict("TXN-8492", 85000, 21);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
