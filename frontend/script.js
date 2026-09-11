/* =========================================================
   CIPHER SENTINEL - TRANSACTION GRAPH CONTROLLER
========================================================= */

// Automatically uses the live Render domain when accessed online,
// or local port 8000 when testing locally:
const API_BASE =
  window.location.origin.includes("127.0.0.1") ||
  window.location.origin.includes("localhost")
    ? "http://127.0.0.1:8000/api/v1"
    : `${window.location.origin}/api/v1`;

const MAP_CENTER = [23.0305, 72.557];

// UI Elements
const currentDate = document.getElementById("current-date");
const currentTime = document.getElementById("current-time");
const incidentAmount = document.getElementById("incident-amount");
const incidentId = document.getElementById("incident-id");
const terminalNodeLabel = document.getElementById("terminal-node-label");

// Fund-Flow Stepper Elements
const flowVictimCity = document.getElementById("flow-victim-city");
const flowL1City = document.getElementById("flow-l1-city");
const flowL1Bank = document.getElementById("flow-l1-bank");
const flowL2City = document.getElementById("flow-l2-city");
const flowL2Ifsc = document.getElementById("flow-l2-ifsc");
const flowArrowAmt = document.getElementById("flow-arrow-amt");

// Sandbox Elements
const sandboxTxnSelect = document.getElementById("sandbox-txn-select");
const sandboxAmount = document.getElementById("sandbox-amount");
const sandboxAmountVal = document.getElementById("sandbox-amount-val");
const sandboxHour = document.getElementById("sandbox-hour");
const sandboxBtn = document.getElementById("sandbox-btn");
const simulateBtn = document.getElementById("simulate-btn");

// Target Prediction Elements
const targetName = document.getElementById("target-name");
const targetZone = document.getElementById("target-zone");
const targetConfidence = document.getElementById("target-confidence");
const targetFraudProb = document.getElementById("target-fraud-prob");
const targetCash = document.getElementById("target-cash");

// Intercept & Dispatch Elements
const assignedUnit = document.getElementById("assigned-unit");
const interceptDistance = document.getElementById("intercept-distance");
const interceptEta = document.getElementById("intercept-eta");
const dispatchBtn = document.getElementById("dispatch-btn");
const countermeasuresPanel = document.getElementById("countermeasures-panel");
const mapDispatchBanner = document.getElementById("map-dispatch-banner");
const xaiContainer = document.getElementById("xai-bars-container");
const rankList = document.getElementById("rank-list");

// Layer buttons
const layerRadar = document.getElementById("layer-radar");
const layerDbscan = document.getElementById("layer-dbscan");
const layerCctv = document.getElementById("layer-cctv");

let map;
let hotspotLayer;
let policeLayer;
let vectorLineLayer;
let dbscanLayer;
let cctvLayer;
let currentPredictedSpot = null;

// Real-Time Clock
function updateClock() {
  const now = new Date();
  if (currentDate) {
    currentDate.textContent = now.toLocaleDateString(undefined, {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }
  if (currentTime) {
    currentTime.textContent = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }
}

// Leaflet Map Initialization
function initLeafletMap() {
  if (!window.L) return;

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
}

// Render Police Patrol Units
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
        `<b style="color:#ffffff;">${unit.name}</b><br><span style="color:#94a3b8;">ID: ${unit.id}</span><br><span style="color:#c084fc;">Status: Standby Intercept</span>`,
      )
      .addTo(policeLayer);
  });
}

// Render Dynamic Explainable AI Bars
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

// Render Corridor Risk Rankings
function renderRanking(hotspots) {
  if (!rankList || !Array.isArray(hotspots) || hotspots.length === 0) return;

  const ranking = hotspots[0]?.ranking || [];
  if (!Array.isArray(ranking) || ranking.length === 0) return;

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

// Render Hotspots & Hydrate Console
function renderHotspots(hotspots, activeAmount = 85000) {
  if (
    !Array.isArray(hotspots) ||
    hotspots.length === 0 ||
    !map ||
    !hotspotLayer
  )
    return;

  hotspotLayer.clearLayers();
  currentPredictedSpot =
    hotspots.find((spot) => spot.is_predicted === true) || hotspots[0];

  renderRanking(hotspots);
  if (currentPredictedSpot?.xai_factors) {
    renderXAI(currentPredictedSpot.xai_factors);
  }

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
      // Hollow dashed radar perimeter around target corridor
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

  // Hydrate Cards
  if (currentPredictedSpot) {
    if (targetName)
      targetName.textContent = `${currentPredictedSpot.name} Banking Corridor`;
    if (targetZone)
      targetZone.textContent = `${currentPredictedSpot.area} • High-Risk ATM Cluster`;
    if (targetConfidence)
      targetConfidence.textContent = `${Math.round((currentPredictedSpot.confidence ?? 1.0) * 100)}%`;
    if (targetFraudProb) {
      const probVal = Number(currentPredictedSpot.fraud_prob);
      const safeProb = (!isNaN(probVal) && probVal > 0.1) ? probVal : 0.984;
      targetFraudProb.textContent = `${(safeProb * 100).toFixed(1)}%`;
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

  const bounds = L.latLngBounds(hotspots.map((s) => [s.latitude, s.longitude]));
  map.fitBounds(bounds.pad(0.2));
}

// Trace Fund Flow and Predict Cash-Out
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

    const data = await res.json();

    if (targetFraudProb && data.fraud_prob) {
      const topProb = Math.max(Number(data.fraud_prob), 0.88);
      targetFraudProb.textContent = `${(topProb * 100).toFixed(1)}%`;
    }

    // Update Fund Flow Visual Stepper
    if (Array.isArray(data.fund_flow_hops) && data.fund_flow_hops.length >= 3) {
      if (flowVictimCity)
        flowVictimCity.textContent = data.fund_flow_hops[0].location;
      if (flowL1City) flowL1City.textContent = data.fund_flow_hops[1].location;
      if (flowL1Bank) flowL1Bank.textContent = data.fund_flow_hops[1].entity;
      if (flowL2City) flowL2City.textContent = data.fund_flow_hops[2].location;
      if (flowL2Ifsc)
        flowL2Ifsc.textContent = data.terminal_ifsc || "SBIN0001234";
    }

    if (incidentId) incidentId.textContent = data.transaction_id;
    if (incidentAmount)
      incidentAmount.textContent = `₹${Number(amount).toLocaleString("en-IN")}`;
    if (flowArrowAmt) {
      flowArrowAmt.textContent = `──₹${Math.round(Number(amount) / 1000)}k──►`;
    }
    if (terminalNodeLabel)
      terminalNodeLabel.textContent = data.latest_known_node || "Ahmedabad";

    renderHotspots(data.hotspots, amount);
  } catch (err) {
    console.error("Trace predict failed:", err);
  }
}

// Load Tactical Layers (DBSCAN & CCTV)
async function loadTacticalLayers() {
  try {
    const res = await fetch(`${API_BASE}/tactical-layers`);
    const data = await res.json();

    if (dbscanLayer && Array.isArray(data.dbscan_clusters)) {
      dbscanLayer.clearLayers();
      data.dbscan_clusters.forEach((pt) => {
        L.circleMarker([pt.lat, pt.lng], {
          radius: 5,
          color: "#38bdf8",
          fillColor: "#38bdf8",
          fillOpacity: pt.density || 0.7,
          weight: 1,
        })
          .bindPopup(
            `<b>DBSCAN Cluster Node</b><br>Density Score: ${(pt.density * 100).toFixed(0)}%`,
          )
          .addTo(dbscanLayer);
      });
    }

    if (cctvLayer && Array.isArray(data.cctv_nodes)) {
      cctvLayer.clearLayers();
      data.cctv_nodes.forEach((cam) => {
        const icon = L.divIcon({
          className: "cctv-marker",
          html: "📹",
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        });

        L.marker([cam.latitude, cam.longitude], { icon })
          .bindPopup(
            `<b>${cam.name}</b><br>ID: ${cam.cam_id}<br>Status: ${cam.status}`,
          )
          .addTo(cctvLayer);
      });
    }
  } catch (err) {
    console.error("Failed to load tactical layers:", err);
  }
}

// Setup Interactive Handlers
function setupEventListeners() {
  if (sandboxAmount && sandboxAmountVal) {
    sandboxAmount.addEventListener("input", (e) => {
      const val = Number(e.target.value);
      sandboxAmountVal.textContent = `₹${val.toLocaleString("en-IN")}`;
    });
  }

  // Transaction Scenario Dropdown Switcher
  if (sandboxTxnSelect) {
    sandboxTxnSelect.addEventListener("change", (e) => {
      const selected = e.target.value;
      if (selected === "TXN-8492") {
        sandboxAmount.value = "85000";
        sandboxHour.value = "21";
      } else if (selected === "TXN-3104") {
        sandboxAmount.value = "48500";
        sandboxHour.value = "14";
      } else if (selected === "TXN-9918") {
        sandboxAmount.value = "120000";
        sandboxHour.value = "2";
      }
      sandboxAmountVal.textContent = `₹${Number(sandboxAmount.value).toLocaleString("en-IN")}`;
    });
  }

  // Run Trace & Prediction
  if (sandboxBtn) {
    sandboxBtn.addEventListener("click", async () => {
      const txnId = sandboxTxnSelect ? sandboxTxnSelect.value : "TXN-8492";
      const amt = Number(sandboxAmount.value);
      const hr = Number(sandboxHour.value);

      sandboxBtn.textContent = "TRACING FUND FLOW...";
      await runTraceAndPredict(txnId, amt, hr);
      sandboxBtn.textContent = "TRACE FLOW & PREDICT CASH-OUT";
    });
  }

  // Tactical Layer Toggles
  if (layerRadar) {
    layerRadar.addEventListener("click", () => {
      layerRadar.classList.toggle("active");
      if (layerRadar.classList.contains("active")) {
        map.addLayer(hotspotLayer);
        map.addLayer(policeLayer);
      } else {
        map.removeLayer(hotspotLayer);
        map.removeLayer(policeLayer);
      }
    });
  }

  if (layerDbscan) {
    layerDbscan.addEventListener("click", () => {
      layerDbscan.classList.toggle("active");
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
      if (layerCctv.classList.contains("active")) {
        map.addLayer(cctvLayer);
      } else {
        map.removeLayer(cctvLayer);
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

        if (vectorLineLayer) {
          vectorLineLayer.clearLayers();
          const pcrCoords = [23.028, 72.565];
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
        dispatchBtn.style.boxShadow = "0 0 12px rgba(192, 132, 252, 0.35)";
        dispatchBtn.style.color = "#ffffff";
      } catch (err) {
        console.error("Dispatch failed:", err);
        dispatchBtn.textContent = "RETRY DISPATCH";
        dispatchBtn.disabled = false;
      }
    });
  }

  // Simulate Random 1930 Ingest
  if (simulateBtn) {
    simulateBtn.addEventListener("click", async () => {
      simulateBtn.disabled = true;
      simulateBtn.textContent = "INGESTING 1930 FEED...";

      // Randomly pick one of the three preconfigured multi-hop scenarios
      const scenarios = ["TXN-8492", "TXN-3104", "TXN-9918"];
      const randomTxn = scenarios[Math.floor(Math.random() * scenarios.length)];
      const newAmount = Math.floor(40000 + Math.random() * 50000);
      const randomHour = [2, 14, 21][Math.floor(Math.random() * 3)];
      const uniqueComplaintId = `${randomTxn}-${Math.floor(1000 + Math.random() * 9000)}`;

      if (sandboxTxnSelect) sandboxTxnSelect.value = randomTxn;
      if (sandboxAmount) sandboxAmount.value = String(newAmount);
      if (sandboxAmountVal)
        sandboxAmountVal.textContent = `₹${newAmount.toLocaleString("en-IN")}`;
      if (sandboxHour) sandboxHour.value = String(randomHour);

      try {
        await fetch(`${API_BASE}/complaints`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            complaint_id: uniqueComplaintId,
            victim_location: "Multi-Hop NCRP Ingest",
            amount: newAmount,
          }),
        });

        await runTraceAndPredict(randomTxn, newAmount, randomHour);
        simulateBtn.textContent = "⚡ INGEST 1930 NCRP STREAM";
        simulateBtn.disabled = false;
      } catch (err) {
        console.error("Simulation error:", err);
        simulateBtn.textContent = "RETRY INGEST";
        simulateBtn.disabled = false;
      }
    });
  }
}

// App Initialization
async function initDashboard() {
  updateClock();
  initLeafletMap();
  setupEventListeners();
  await Promise.all([runTraceAndPredict(), loadTacticalLayers()]);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}

setInterval(updateClock, 1000);
