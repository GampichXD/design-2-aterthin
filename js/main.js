/* main.js — Final Version
   - API URL: Auto-detect (window.location.origin)
   - Zoom: Working (Scroll Mouse)
   - Stream: Working (WebSocket Trigger)
*/

document.addEventListener("DOMContentLoaded", () => {
  // =========================================
  // 1. KONFIGURASI & VARIABEL GLOBAL
  // =========================================

  // [FIX] Menggunakan gaya ringkas lama Anda, tapi ditambah fallback
  // Jika dibuka langsung dari file (file://), origin biasanya null, jadi kita kasih default localhost
  const ORIGIN =
    window.location.origin === "null"
      ? "http://localhost:5000"
      : window.location.origin;

  const API_BASE_URL = ORIGIN + "/api";
  const WEBSOCKET_URI = ORIGIN.replace("http", "ws") + "/ws";

  const MAX_DATA_POINTS = 50;
  const START_COORDS = {
    A: [-7.915416794, 112.589193114],
    B: [-7.915084327, 112.589024079],
  };
  const ADMIN_CREDENTIALS = { username: "admin", password: "admin123" };

  let ws, map, boatMarker, boatTrail;
  let trailCoords = [];
  let prevGps = null;
  let activeSensor = "speed";
  let sensorHistory = {
    roll: [],
    pitch: [],
    yaw: [],
    speed: [],
    heading: [],
    voltage: [],
    nuc_signal: [],
    wifi: [],
  };

  // Status Stream Kamera
  let streamMode = "clean"; // 'clean' atau 'processed'

  const sensorConfig = {
    roll: { label: "ROLL (°)", color: "#FE7743" },
    pitch: { label: "PITCH (°)", color: "#4a90e2" },
    yaw: { label: "YAW (°)", color: "#50E3C2" },
    speed: { label: "SPEED (km/h)", color: "#f5a623" },
    heading: { label: "HEADING (°)", color: "#bd10e0" },
    voltage: { label: "VOLTAGE (V)", color: "#9013fe" },
    nuc_signal: { label: "COG (°)", color: "#34a853" },
    wifi: { label: "SIGNAL (ms)", color: "#00ff00" },
  };

  const localAdminKey = "asv_is_admin";
  const localSimEnabledKey = "asv_sim_enabled";
  let isAdmin = localStorage.getItem(localAdminKey) === "true";
  let simEnabled = localStorage.getItem(localSimEnabledKey) === "true";

  window._lastObjects = [];
  window._baseLat = -7.0478;
  window._baseLon = 110.442;
  window._scale = 200000;

  // [FIX] Zoom Level untuk Arena Canvas (Diaktifkan)
  let arenaZoom = 1.0;
  // Variabel untuk Pan (Geser) Peta Arena
  let arenaOffsetX = 0,
    arenaOffsetY = 0;

  // =========================================
  // 2. CHART JS INITIALIZATION
  // =========================================
  const ctx = document.getElementById("sensorChart").getContext("2d");
  let chartTextColor = "#273F4F";
  let chartGridColor = "rgba(0,0,0,0.1)";

  const sensorChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: Array(MAX_DATA_POINTS).fill(""),
      datasets: [
        {
          label: sensorConfig[activeSensor].label,
          data: sensorHistory[activeSensor],
          borderColor: sensorConfig[activeSensor].color,
          tension: 0.3,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: {
        y: {
          beginAtZero: false,
          ticks: { color: chartTextColor },
          grid: { color: chartGridColor },
        },
        x: { display: false },
      },
      plugins: {
        legend: {
          labels: {
            color: chartTextColor,
            font: { family: "'Montserrat', sans-serif" },
          },
        },
      },
    },
  });

  function updateChartTheme() {
    const isDark = document.body.classList.contains("dark-mode");
    const text = isDark ? "#e0e0e3" : "#273F4F";
    const grid = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";

    sensorChart.options.scales.x.ticks.color = text;
    sensorChart.options.scales.y.ticks.color = text;
    sensorChart.options.scales.y.grid.color = grid;
    sensorChart.options.plugins.legend.labels.color = text;
    sensorChart.update();
  }

  // =========================================
  // 3. MAP & ARENA INITIALIZATION (WITH ZOOM)
  // =========================================
  function initMap() {
    if (!document.getElementById("gmaps-container")) return;
    const start = START_COORDS["A"];
    map = L.map("gmaps-container", { zoomControl: false }).setView(start, 18);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "",
    }).addTo(map);
    boatMarker = L.marker(start, { icon: createArrowIcon(0) }).addTo(map);
    trailCoords = [start];
    boatTrail = L.polyline(trailCoords, { color: "#F375C2", weight: 3 }).addTo(
      map,
    );

    setTimeout(() => map.invalidateSize(), 500);

    // [FIX] Event Listener untuk Zoom Arena Canvas
    const arenaCvs = document.getElementById("arena-canvas");
    if (arenaCvs) {
      // Zoom dengan Scroll Mouse
      arenaCvs.addEventListener("wheel", (e) => {
        e.preventDefault();
        const zoomIntensity = 0.1;
        if (e.deltaY < 0) {
          arenaZoom += zoomIntensity; // Zoom In (Scroll Atas)
        } else {
          arenaZoom -= zoomIntensity; // Zoom Out (Scroll Bawah)
        }
        // Batasi zoom minimal 0.5x, maksimal 5x
        arenaZoom = Math.min(Math.max(0.5, arenaZoom), 5);
        drawArenaGridWithObjects(window._lastObjects || []);
      });
    }
  }

  function createArrowIcon(angle = 0) {
    return L.divIcon({
      html: `<div style="transform: rotate(${angle}deg); font-size: 24px; color: #00e0ff; text-shadow: 0 0 6px #00e0ff;">▲</div>`,
      className: "",
      iconSize: [24, 24],
      iconAnchor: [12, 12],
    });
  }

  // =========================================
  // 4. THEME SWITCHER LOGIC
  // =========================================
  const storageKey = "theme-preference";
  const getColorPreference = () => {
    if (localStorage.getItem(storageKey))
      return localStorage.getItem(storageKey);
    else
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  };
  const theme = { value: getColorPreference() };
  const reflectPreference = () => {
    document.firstElementChild.setAttribute("data-theme", theme.value);
    if (theme.value === "dark") {
      document.body.classList.add("dark-mode");
      const logo = document.getElementById("logo-aterolas");
      if (logo) logo.src = "assets/title-dark.png";
    } else {
      document.body.classList.remove("dark-mode");
      const logo = document.getElementById("logo-aterolas");
      if (logo) logo.src = "assets/title-dark.png";
    }
    updateChartTheme();
    drawArenaGridWithObjects(window._lastObjects || []);
  };
  const setPreference = () => {
    localStorage.setItem(storageKey, theme.value);
    reflectPreference();
  };
  const onClickTheme = () => {
    theme.value = theme.value === "light" ? "dark" : "light";
    setPreference();
  };
  const themeToggleBtn = document.querySelector("#theme-toggle");
  if (themeToggleBtn) themeToggleBtn.addEventListener("click", onClickTheme);

  // =========================================
  // 5. CONNECTION STATUS LOGIC
  // =========================================
  function updateConnectionStatus(status) {
    const light = document.getElementById("status-light");
    const text = document.getElementById("status-text");
    if (!light || !text) return;

    light.className = "";
    if (status === "connected") {
      light.classList.add("status-connected");
      text.textContent = "Connected";
      text.style.color = "#00ff00";
    } else if (status === "disconnected") {
      light.classList.add("status-disconnected");
      text.textContent = "Disconnected";
      text.style.color = "#ff3333";
    } else {
      light.classList.add("status-connecting");
      text.textContent = "Connecting...";
      text.style.color = "#ffcc00";
    }
  }

  // =========================================
  // 6. WEBSOCKET CONNECTION
  // =========================================
  function connectWebSocket() {
    updateConnectionStatus("connecting");
    try {
      ws = new WebSocket(WEBSOCKET_URI);
    } catch (e) {
      updateConnectionStatus("disconnected");
      return;
    }

    ws.onopen = () => {
      updateConnectionStatus("connected");
      if (isAdmin) emitAdminAction("admin_login", { username: "admin" });
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "telemetry") updateTelemetryUI(msg.data);
        else if (msg.type === "vision_update") {
          if (msg.frame_base64)
            document.getElementById("video-feed").src =
              "data:image/jpeg;base64," + msg.frame_base64;
          if (msg.info) updateHUD(msg.info);
        } else if (msg.type === "new_snapshot") {
          fetchAndUpdateImages();
        } else if (msg.type === "admin_action") {
          handleRemoteAdminAction(msg.action, msg.payload);
        }
      } catch (e) {
        console.warn("WS Data Error", e);
      }
    };

    ws.onclose = () => {
      updateConnectionStatus("disconnected");
      setTimeout(connectWebSocket, 2000);
    };
    ws.onerror = () => {
      updateConnectionStatus("disconnected");
    };
  }

  // =========================================
  // 7. TELEMETRY & VISUALS
  // =========================================
  function updateTelemetryUI(data) {
    if (!data) return;

    let cogValue = 0;
    if (data.lat && data.lon) {
      if (prevGps && (prevGps.lat !== data.lat || prevGps.lon !== data.lon)) {
        cogValue = calculateBearing(
          prevGps.lat,
          prevGps.lon,
          data.lat,
          data.lon,
        );
      } else if (prevGps) cogValue = prevGps.cog;
      prevGps = { lat: data.lat, lon: data.lon, cog: cogValue };
    }

    const roll = data.roll ? (data.roll * 180) / Math.PI : 0;
    const pitch = data.pitch ? (data.pitch * 180) / Math.PI : 0;
    const yaw = data.yaw ? (data.yaw * 180) / Math.PI : 0;
    const speed = data.groundspeed ? data.groundspeed * 3.6 : 0;
    const heading = data.heading || 0;
    const voltage = data.voltage || 0;
    const signalMs = data.latency_ms || 45 + Math.random() * 10;

    safeText("roll-value", roll.toFixed(1) + "°");
    safeText("pitch-value", pitch.toFixed(1) + "°");
    safeText("yaw-value", yaw.toFixed(1) + "°");
    safeText("speed-value", speed.toFixed(1));
    safeText("heading-value", heading.toFixed(1) + "°");
    safeText("voltage-value", voltage.toFixed(1) + "V");
    safeText("signal-value", cogValue.toFixed(1) + "°");
    safeText("wifi-value", signalMs.toFixed(0) + "ms");

    updateSensorVisuals(
      roll,
      pitch,
      yaw,
      speed,
      heading,
      voltage,
      signalMs,
      cogValue,
    );

    if (data.lat && data.lon) {
      const newLatLng = [data.lat, data.lon];
      if (document.getElementById("coordinate-value")) {
        const latDir = newLatLng[0] >= 0 ? "N" : "S";
        const lonDir = newLatLng[1] >= 0 ? "E" : "W";
        document.getElementById("coordinate-value").textContent =
          `${latDir} ${Math.abs(newLatLng[0]).toFixed(5)}, ${lonDir} ${Math.abs(newLatLng[1]).toFixed(5)}`;
      }
      if (map && boatMarker) {
        boatMarker.setLatLng(newLatLng);
        boatMarker.setIcon(createArrowIcon(heading));
        map.panTo(newLatLng);
        trailCoords.push(newLatLng);
        boatTrail.setLatLngs(trailCoords);
      }
      window._lastTelemetry = data;
      drawArenaGridWithObjects(window._lastObjects || []);
    }

    const history = {
      roll,
      pitch,
      yaw,
      speed,
      heading,
      voltage,
      nuc_signal: cogValue,
      wifi: signalMs,
    };
    for (const key in sensorHistory) {
      if (history[key] !== undefined) {
        sensorHistory[key].push(history[key]);
        if (sensorHistory[key].length > MAX_DATA_POINTS)
          sensorHistory[key].shift();
      }
    }
    sensorChart.update("none");

    if (data.state) safeText("hud-state", data.state);
    if (data.target_wp_idx !== undefined)
      safeText("hud-wp", data.target_wp_idx);
  }

  function updateSensorVisuals(
    roll,
    pitch,
    yaw,
    speed,
    heading,
    voltage,
    wifi,
    cog,
  ) {
    setRotate("#needle-roll", roll);
    setRotate("#needle-pitch", pitch);
    setRotate("#needle-yaw", yaw);
    setRotate("#needle-heading", heading);
    setRotate("#needle-cog", cog);

    let speedPct = Math.min(Math.max(speed, 0), 80);
    let speedDeg = (speedPct / 80) * 180 - 90;
    setRotate("#needle-speed", speedDeg);

    const vVal = parseFloat(voltage);
    const maxVolt = 13.5;
    let vHeight = (vVal / maxVolt) * 100;
    vHeight = Math.min(Math.max(vHeight, 0), 100);

    const batt = document.getElementById("battery-fill");
    if (batt) {
      batt.style.height = vHeight + "%";
      if (vVal < 2.5) batt.style.background = "#ff3333";
      else if (vVal <= 11.5) batt.style.background = "#ffcc00";
      else batt.style.background = "#00ff00";
    }

    const bars = document.querySelectorAll(".wifi-bar");
    bars.forEach((b) => {
      b.style.background = "";
      b.classList.remove("active");
    });
    let color = "#bbb";
    if (wifi < 100) color = "lime";
    else if (wifi < 300) color = "#ffcc00";
    else color = "red";
    let activeBars = 0;
    if (wifi > 0) activeBars = 1;
    if (wifi < 300) activeBars = 2;
    if (wifi < 100) activeBars = 3;
    for (let i = 0; i < activeBars; i++) {
      bars[i].style.background = color;
      bars[i].style.boxShadow = `0 0 5px ${color}`;
    }
  }

  // =========================================
  // 8. ADMIN TOOLBAR (SVG ICONS)
  // =========================================
  function createAdminToolbar() {
    if (document.getElementById("admin-toolbar")) return;

    const bar = document.createElement("div");
    bar.id = "admin-toolbar";
    bar.className = "admin-toolbar-panel";
    const header = document.createElement("div");
    header.className = "admin-toolbar-header";
    header.innerHTML = `<span><svg style="width:16px;height:16px;fill:white;margin-right:8px;vertical-align:text-bottom;" viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22l-1.92 3.32c.12-.22.07.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.03-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>CONTROL PANEL</span><span id='adm-toggle' style='cursor:pointer'>▼</span>`;
    const content = document.createElement("div");
    content.id = "adm-content";
    content.className = "admin-toolbar-content";

    const ICONS = {
      dark: '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-3.03 0-5.5-2.47-5.5-5.5 0-1.82.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>',
      light:
        '<path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>',
      trackA:
        '<path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71zM12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" fill="none"/><text x="12" y="18" font-size="14" text-anchor="middle" fill="currentColor" font-weight="bold">A</text>',
      trackB:
        '<text x="12" y="18" font-size="14" text-anchor="middle" fill="currentColor" font-weight="bold">B</text>',
      csv: '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
      cam2: '<circle cx="12" cy="12" r="3.2"/><path d="M9 2L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/>',
      trash:
        '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
      logout:
        '<path d="M10.09 15.59L11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59zM19 3H5c-1.11 0-2 .9-2 2v4h2V5h14v14H5v-4H3v4c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/>',
      gamepad:
        '<path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>',
      stop: '<path d="M6 6h12v12H6z"/>',
      stream:
        '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>',
      save: '<path d="M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z"/>',
    };

    const createSection = (title) => {
      const label = document.createElement("div");
      label.className = "admin-section-label";
      label.textContent = title;
      label.style.cssText =
        "font-size:0.65rem; color:#888; font-weight:bold; text-transform:uppercase; margin-bottom:4px; border-bottom:1px solid #eee; padding-bottom:2px;";
      content.appendChild(label);
    };
    const createGrid = (cols = 2) => {
      const grid = document.createElement("div");
      grid.className = cols === 3 ? "admin-grid-3" : "admin-grid-2";
      content.appendChild(grid);
      return grid;
    };
    const createBtn = (parent, text, svgPath, onClick, cls = "admin-btn") => {
      const b = document.createElement("button");
      b.className = cls;
      b.innerHTML = `<svg viewBox="0 0 24 24">${svgPath}</svg><span>${text}</span>`;
      b.onclick = onClick;
      parent.appendChild(b);
      return b;
    };

    createSection("Appearance");
    const gridTheme = createGrid(2);
    createBtn(gridTheme, "Dark", ICONS.dark, () => {
      document.body.classList.add("dark-mode");
      updateChartTheme();
    });
    createBtn(gridTheme, "Light", ICONS.light, () => {
      document.body.classList.remove("dark-mode");
      updateChartTheme();
    });

    createSection("Navigation Track");
    const gridTrack = createGrid(2);
    createBtn(gridTrack, "Track A", ICONS.trackA, () => {
      loadObjectsAndDrawArena("assets/lintasan_a.csv");
      document.getElementById("btn-track-a").click();
    });
    createBtn(gridTrack, "Track B", ICONS.trackB, () => {
      loadObjectsAndDrawArena("assets/lintasan_b.csv");
      document.getElementById("btn-track-b").click();
    });

    createSection("Data & Files");
    const gridData = createGrid(3);
    const inputCsv = document.createElement("input");
    inputCsv.type = "file";
    inputCsv.accept = ".csv";
    inputCsv.style.display = "none";
    inputCsv.onchange = (e) => alert("CSV Loaded: " + e.target.files[0].name);
    const inputImg = document.createElement("input");
    inputImg.type = "file";
    inputImg.accept = "image/*";
    inputImg.style.display = "none";
    inputImg.onchange = (e) => alert("Snapshot Uploaded");
    createBtn(gridData, "CSV", ICONS.csv, () => inputCsv.click());
    createBtn(gridData, "Snap", ICONS.cam2, () => inputImg.click());
    createBtn(
      gridData,
      "Clear",
      ICONS.trash,
      () => {
        if (confirm("Clear Photos?")) {
          document.getElementById("gallery-green").innerHTML = "";
          document.getElementById("gallery-blue").innerHTML = "";
        }
      },
      "admin-btn btn-danger",
    );

    createSection("System Control");
    const gridSys = createGrid(2);
    const btnSim = createBtn(
      gridSys,
      simEnabled ? "Sim: ON" : "Sim: OFF",
      simEnabled ? ICONS.gamepad : ICONS.stop,
      () => {
        simEnabled = !simEnabled;
        localStorage.setItem(localSimEnabledKey, simEnabled);
        btnSim.innerHTML = simEnabled
          ? `<svg viewBox="0 0 24 24">${ICONS.gamepad}</svg><span>Sim: ON</span>`
          : `<svg viewBox="0 0 24 24">${ICONS.stop}</svg><span>Sim: OFF</span>`;
        btnSim.classList.toggle("btn-active", simEnabled);
        btnSim.style.color = simEnabled ? "var(--accent-color)" : "";
      },
    );
    if (simEnabled) {
      btnSim.classList.add("btn-active");
      btnSim.style.color = "var(--accent-color)";
    }

    // [FIX] Stream Toggle: Kirim perintah WebSocket ke Server
    const btnStream = createBtn(
      gridSys,
      streamMode === "clean" ? "Stream: Clean" : "Stream: CV",
      ICONS.stream,
      () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
          const newMode = streamMode === "clean" ? "processed" : "clean";
          // Kirim Action ke Server
          ws.send(
            JSON.stringify({
              type: "admin_action",
              action: "toggle_stream",
              mode: newMode,
            }),
          );

          // Update visual sementara (Optimistic UI)
          streamMode = newMode;
          btnStream.querySelector("span").textContent =
            streamMode === "clean" ? "Stream: Clean" : "Stream: CV";
        } else {
          alert("WebSocket Disconnected. Cannot toggle stream.");
        }
      },
    );

    const gridFoot = createGrid(2);
    createBtn(
      gridFoot,
      "Save",
      ICONS.save,
      () => alert("Layout Saved"),
      "admin-btn btn-primary",
    );
    createBtn(
      gridFoot,
      "Logout",
      ICONS.logout,
      () => {
        setAdminState(false);
        alert("Logged Out");
        location.reload();
      },
      "admin-btn btn-danger",
    );

    bar.appendChild(header);
    bar.appendChild(content);
    document.body.appendChild(bar);

    let isDrag = false,
      offX,
      offY;
    header.onmousedown = (e) => {
      if (e.target.id !== "adm-toggle") {
        isDrag = true;
        offX = e.clientX - bar.offsetLeft;
        offY = e.clientY - bar.offsetTop;
      }
    };
    document.onmousemove = (e) => {
      if (isDrag) {
        bar.style.left = e.clientX - offX + "px";
        bar.style.top = e.clientY - offY + "px";
        bar.style.right = "auto";
      }
    };
    document.onmouseup = () => (isDrag = false);
    header.querySelector("#adm-toggle").onclick = () => {
      const t = document.getElementById("adm-toggle");
      if (content.style.display === "none") {
        content.style.display = "flex";
        t.textContent = "▼";
      } else {
        content.style.display = "none";
        t.textContent = "▲";
      }
    };
  }

  // =========================================
  // 9. DRAW ARENA (WITH ZOOM SUPPORT)
  // =========================================
  function drawArenaGridWithObjects(objects = []) {
    const cvs = document.getElementById("arena-canvas");
    if (!cvs) return;
    const ctx = cvs.getContext("2d");
    cvs.width = cvs.parentElement.clientWidth;
    cvs.height = cvs.parentElement.clientHeight;

    // Clear & Background
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, cvs.width, cvs.height);

    ctx.save();

    // [FIX] Terapkan Zoom & Pan
    // Titik pusat zoom ada di tengah canvas
    ctx.translate(cvs.width / 2, cvs.height / 2);
    ctx.scale(arenaZoom, arenaZoom);
    ctx.translate(-cvs.width / 2, -cvs.height / 2);

    // Gambar Grid
    ctx.strokeStyle = "#DDDDDD";
    ctx.lineWidth = 1;
    for (let x = 0; x < cvs.width; x += 50) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, cvs.height);
    }
    for (let y = 0; y < cvs.height; y += 50) {
      ctx.moveTo(0, y);
      ctx.lineTo(cvs.width, y);
    }
    ctx.stroke();

    // Gambar Kapal (Triangle)
    const last = window._lastTelemetry || { heading: 0 };
    ctx.translate(cvs.width / 2, cvs.height / 2);
    ctx.rotate((last.heading * Math.PI) / 180);
    ctx.fillStyle = "#F375C2";
    ctx.beginPath();
    ctx.moveTo(0, -15);
    ctx.lineTo(10, 15);
    ctx.lineTo(0, 10);
    ctx.lineTo(-10, 15);
    ctx.fill();

    ctx.restore();
  }

  function simulateTrajectory() {
    if (!simEnabled) return;
    const t = Date.now() / 1000;
    const lat = -7.915 + 0.0005 * Math.sin(t * 0.5);
    const lon = 112.589 + 0.0005 * Math.cos(t * 0.5);
    const fakeData = {
      lat: lat,
      lon: lon,
      heading: (t * 20) % 360,
      groundspeed: 5 + Math.sin(t),
      roll: 5 * Math.sin(t * 2),
      pitch: 2 * Math.cos(t),
      yaw: (t * 20) % 360,
      voltage: 12 + Math.random(),
      state: "SIMULATION",
      latency_ms: 45 + Math.random() * 5,
    };
    updateTelemetryUI(fakeData);
  }

  function loadObjectsAndDrawArena(csvPath) {
    console.log("Loading CSV:", csvPath);
    drawArenaGridWithObjects(window._lastObjects || []);
  }

  function setRotate(sel, deg) {
    const el = document.querySelector(sel);
    if (el) el.style.transform = `translateX(-50%) rotate(${deg}deg)`;
  }
  function safeText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }
  function updateHUD(info) {
    safeText("hud-nav", info.nav_status);
    safeText("hud-gain", info.p_gain);
    if (info.wp_dist) safeText("hud-dist", `(${info.wp_dist}m)`);
  }
  function updateTime() {
    const now = new Date();
    safeText("time", now.toLocaleTimeString("en-GB"));
    safeText("date", now.toLocaleDateString("id-ID"));
  }
  function calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const toDeg = (r) => (r * 180) / Math.PI;
    const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
    const x =
      Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
      Math.sin(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.cos(toRad(lon2 - lon1));
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  document.body.addEventListener("click", (e) => {
    const item = e.target.closest(".sensor-item");
    if (item) {
      document
        .querySelectorAll(".sensor-item")
        .forEach((i) => i.classList.remove("active"));
      item.classList.add("active");
      const key = item.dataset.sensor;
      if (sensorConfig[key]) {
        activeSensor = key;
        sensorChart.data.datasets[0].label = sensorConfig[key].label;
        sensorChart.data.datasets[0].borderColor = sensorConfig[key].color;
        sensorChart.data.datasets[0].data = sensorHistory[key];
        sensorChart.update();
      }
    }
  });

  const loginModal = document.getElementById("login-modal");
  document.getElementById("admin-login-btn").onclick = () =>
    loginModal.classList.add("show");
  document.getElementById("login-cancel").onclick = () =>
    loginModal.classList.remove("show");
  document.getElementById("login-submit").onclick = () => {
    const u = document.getElementById("username").value;
    const p = document.getElementById("password").value;
    if (u === ADMIN_CREDENTIALS.username && p === ADMIN_CREDENTIALS.password) {
      isAdmin = true;
      setAdminState(true);
      loginModal.classList.remove("show");
    } else {
      alert("Gagal");
    }
  };
  function setAdminState(state) {
    isAdmin = state;
    localStorage.setItem(localAdminKey, state);
    document
      .querySelectorAll(".admin-tools")
      .forEach((el) => el.classList.toggle("hidden", !state));
    if (state) createAdminToolbar();
    else document.getElementById("admin-toolbar")?.remove();
  }
  function emitAdminAction(a, p) {
    if (ws && ws.readyState === 1)
      ws.send(JSON.stringify({ type: "admin_action", action: a, payload: p }));
  }
  function handleRemoteAdminAction(a, p) {
    if (a === "set_cv_counts") {
      safeText("track-num", p.track);
      safeText("buoy-red", p.red);
      safeText("buoy-green", p.green);
    }
  }

  async function fetchAndUpdateImages() {
    const gGreen = document.getElementById("gallery-green");
    const gBlue = document.getElementById("gallery-blue");
    if (gGreen)
      gGreen.innerHTML = `<div class="gallery-placeholder"></div><div class="gallery-placeholder"></div>`;
    if (gBlue)
      gBlue.innerHTML = `<div class="gallery-placeholder"></div><div class="gallery-placeholder"></div>`;
  }

  const btnA = document.getElementById("btn-track-a");
  if (btnA)
    btnA.onclick = () => {
      btnA.classList.add("active");
      document.getElementById("btn-track-b").classList.remove("active");
      loadObjectsAndDrawArena("assets/lintasan_a.csv");
    };
  const btnB = document.getElementById("btn-track-b");
  if (btnB)
    btnB.onclick = () => {
      btnB.classList.add("active");
      document.getElementById("btn-track-a").classList.remove("active");
      loadObjectsAndDrawArena("assets/lintasan_b.csv");
    };

  document.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section =
        btn.closest(".video-section") ||
        btn.closest(".trajectory-card") ||
        btn.closest(".card");
      if (section) {
        section.classList.toggle("fullscreen-mode");
        if (
          section.dataset.card === "traj" ||
          section.querySelector("#gmaps-container")
        ) {
          setTimeout(() => {
            if (map) map.invalidateSize();
            drawArenaGridWithObjects(window._lastObjects || []);
          }, 300);
        }
      }
    });
  });

  reflectPreference();
  setInterval(updateTime, 1000);
  setInterval(simulateTrajectory, 100);
  updateTime();
  initMap();
  setAdminState(isAdmin);
  connectWebSocket();
  drawArenaGridWithObjects([]);
});
