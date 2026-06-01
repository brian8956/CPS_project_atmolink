(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.getStoredMqttCredentials = function getStoredMqttCredentials() {
    const raw = localStorage.getItem(AtmoLink.config.mqttCredentialsStorageKey);
    if (!raw) return null;
    try {
      const credentials = JSON.parse(raw);
      if (!credentials.username || !credentials.password) return null;
      return credentials;
    } catch (err) {
      localStorage.removeItem(AtmoLink.config.mqttCredentialsStorageKey);
      return null;
    }
  };

  AtmoLink.promptForMqttCredentials = function promptForMqttCredentials() {
    const current = AtmoLink.getStoredMqttCredentials();
    const username = window.prompt('MQTT 使用者名稱', current?.username || '');
    if (!username) return null;
    const password = window.prompt('MQTT 密碼（只會儲存在此瀏覽器 localStorage）', '');
    if (!password) return null;

    const credentials = { username, password };
    localStorage.setItem(AtmoLink.config.mqttCredentialsStorageKey, JSON.stringify(credentials));
    AtmoLink.addLog('MQTT', '已在此瀏覽器儲存 MQTT 登入資訊。');
    return credentials;
  };

  AtmoLink.setSimulation = function setSimulation(enabled) {
    AtmoLink.state.simulate = enabled;
    document.getElementById('sim-toggle').textContent = enabled ? '停止模擬' : '啟用模擬';
    document.getElementById('data-mode').textContent = enabled ? '資料源：模擬展示' : '資料源：MQTT / 等待資料';

    if (AtmoLink.state.simTimer) clearInterval(AtmoLink.state.simTimer);
    AtmoLink.state.simTimer = null;

    if (enabled) {
      AtmoLink.addLog('SIM', '啟用模擬資料流程，可展示熱分層、熱力圖與節點失聯。');
      AtmoLink.state.simTimer = setInterval(AtmoLink.generateSimulation, 1000);
      AtmoLink.generateSimulation();
    }
  };

  AtmoLink.normalizePayload = function normalizePayload(raw, fallbackKey) {
    const { topics } = AtmoLink.config;
    const key = String(raw.node_id || fallbackKey || '').toUpperCase();
    if (!topics[key]) return null;
    const now = Date.now();
    return {
      node_id: key,
      temperature: Number(raw.temperature),
      humidity: Number(raw.humidity),
      timestamp: Number(raw.timestamp || now),
      seq: Number(raw.seq || 0),
      battery: raw.battery == null ? null : Number(raw.battery),
      mode: raw.mode || 'wifi',
      receivedAt: now
    };
  };

  AtmoLink.ingest = function ingest(raw, fallbackKey, source) {
    const data = AtmoLink.normalizePayload(raw, fallbackKey);
    if (!data || Number.isNaN(data.temperature) || Number.isNaN(data.humidity)) return;

    const old = AtmoLink.state.sensors[data.node_id];
    AtmoLink.state.sensors[data.node_id] = data;
    if (!old || old.seq !== data.seq) {
      AtmoLink.pushHistory(data.node_id, data.temperature);
    }
    if (source === 'mqtt') AtmoLink.state.realMessages += 1;
    AtmoLink.renderAll();
  };

  AtmoLink.pushHistory = function pushHistory(key, temperature) {
    const { maxPoints } = AtmoLink.config;
    const { history } = AtmoLink.state;
    const now = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (history.labels[history.labels.length - 1] !== now) {
      history.labels.push(now);
      if (history.labels.length > maxPoints) history.labels.shift();
    }
    history.temp[key].push(Number(temperature.toFixed(2)));
    if (history.temp[key].length > maxPoints) history.temp[key].shift();
    AtmoLink.updateTemperatureChart();
  };

  AtmoLink.generateSimulation = function generateSimulation() {
    AtmoLink.state.simTick += 1;
    const tick = AtmoLink.state.simTick;
    const now = Date.now();
    const heatPulse = Math.max(0, Math.sin(tick / 9));
    const humidityPulse = Math.max(0, Math.sin((tick - 8) / 11));
    const offlineC = tick % 45 > 30 && tick % 45 < 39;
    const samples = {
      A: { temperature: 24.0 + heatPulse * 0.4 + Math.sin(tick / 7) * 0.08, humidity: 58 + humidityPulse * 18 },
      B: { temperature: 24.6 + heatPulse * 1.0 + Math.sin(tick / 8) * 0.08, humidity: 56 + humidityPulse * 8 },
      C: { temperature: 25.0 + heatPulse * 1.6 + Math.sin(tick / 9) * 0.08, humidity: 55 + humidityPulse * 6 },
      D: { temperature: 26.0 + heatPulse * 2.3 + Math.sin(tick / 10) * 0.08, humidity: 54 + humidityPulse * 3 }
    };

    AtmoLink.config.nodes.forEach((key, index) => {
      if (key === 'C' && offlineC) {
        if (tick % 45 === 31) AtmoLink.addLog('FAULT', 'Node C 模擬斷電，前端將以逾時判定失聯。');
        return;
      }
      AtmoLink.ingest({
        node_id: key,
        temperature: samples[key].temperature,
        humidity: samples[key].humidity,
        timestamp: now,
        seq: tick * 10 + index,
        battery: 4.85 - index * 0.08,
        mode: 'sim'
      }, key, 'sim');
    });
  };

  AtmoLink.startMqtt = function startMqtt() {
    const { brokerUrl, topics } = AtmoLink.config;
    const pill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const credentials = AtmoLink.getStoredMqttCredentials();

    if (!window.mqtt) {
      pill.className = 'status-pill error';
      statusText.textContent = 'MQTT 函式庫未載入';
      AtmoLink.setSimulation(true);
      return;
    }

    if (!credentials) {
      pill.className = 'status-pill';
      statusText.textContent = '未設定 MQTT';
      document.getElementById('data-mode').textContent = '資料源：模擬展示';
      AtmoLink.addLog('MQTT', '未設定 MQTT 登入資訊，改用模擬模式。');
      AtmoLink.setSimulation(true);
      return;
    }

    const client = mqtt.connect(brokerUrl, {
      clientId: 'atmolink-web-' + Math.random().toString(36).slice(2, 10),
      username: credentials.username,
      password: credentials.password,
      clean: true,
      reconnectPeriod: 3000,
      connectTimeout: 5000
    });
    const fallbackTimer = setTimeout(() => {
      if (AtmoLink.state.realMessages === 0 && !AtmoLink.state.simulate) AtmoLink.setSimulation(true);
    }, 7000);

    client.on('connect', () => {
      pill.className = 'status-pill connected';
      statusText.textContent = '已連線';
      document.getElementById('data-mode').textContent = AtmoLink.state.simulate ? '資料源：模擬展示' : '資料源：MQTT 已連線';
      Object.values(topics).forEach((topic) => client.subscribe(topic));
      AtmoLink.addLog('MQTT', '已連線並訂閱 room/sensor/A-D。');
    });
    client.on('error', () => {
      pill.className = 'status-pill error';
      statusText.textContent = '連線失敗';
    });
    client.on('reconnect', () => {
      pill.className = 'status-pill';
      statusText.textContent = '重新連線中...';
    });
    client.on('message', (topic, payload) => {
      try {
        const data = JSON.parse(payload.toString());
        const key = Object.keys(topics).find((nodeKey) => topics[nodeKey] === topic);
        AtmoLink.ingest(data, key, 'mqtt');
        if (AtmoLink.state.simulate) AtmoLink.setSimulation(false);
        document.getElementById('data-mode').textContent = '資料源：MQTT 即時資料';
        clearTimeout(fallbackTimer);
      } catch (err) {
        AtmoLink.addLog('WARN', `訊息解析失敗：${err.message}`);
      }
    });
  };
})(window);
