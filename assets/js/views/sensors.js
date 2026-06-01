(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.renderSensorCards = function renderSensorCards() {
    const { nodes, colors } = AtmoLink.config;
    const { heights } = AtmoLink.state;
    const cardRoot = document.getElementById('sensor-cards');
    cardRoot.innerHTML = nodes.map((key) => `
      <article class="card card-${key}" id="card-${key}">
        <div class="freshness" id="fresh-${key}">offline</div>
        <div class="card-label"><span class="sensor-dot" style="background:${colors[key]}"></span>Node ${key} · <span id="card-h-${key}">${heights[key].toFixed(2)}m</span></div>
        <div class="card-value" id="value-${key}" style="color:${colors[key]}">--</div>
        <div class="card-meta">
          <span id="temp-${key}">Temperature -- °C</span>
          <span id="hum-${key}">Humidity -- %RH</span>
          <span id="seq-${key}">seq -- · battery -- V</span>
        </div>
      </article>
    `).join('');
  };

  AtmoLink.updateCards = function updateCards() {
    const { nodes } = AtmoLink.config;
    const { sensors, previousHumidity } = AtmoLink.state;

    nodes.forEach((key) => {
      const sensor = sensors[key];
      const card = document.getElementById(`card-${key}`);
      const online = AtmoLink.isOnline(key);
      card.classList.toggle('offline', !online);
      if (!sensor) return;

      const diff = previousHumidity[key] == null ? 0 : sensor.humidity - previousHumidity[key];
      const trend = Math.abs(diff) < 0.1 ? '' : diff > 0 ? ` +${diff.toFixed(1)}%` : ` ${diff.toFixed(1)}%`;

      document.getElementById(`value-${key}`).textContent = `${sensor.humidity.toFixed(1)}%`;
      document.getElementById(`temp-${key}`).textContent = `Temperature ${sensor.temperature.toFixed(2)} °C`;
      document.getElementById(`hum-${key}`).textContent = `Humidity ${sensor.humidity.toFixed(1)} %RH${trend}`;
      document.getElementById(`seq-${key}`).textContent = `seq ${sensor.seq || '--'} · battery ${sensor.battery == null ? '--' : sensor.battery.toFixed(2)} V`;
      document.getElementById(`fresh-${key}`).textContent = online ? `${AtmoLink.ageSeconds(key).toFixed(1)}s` : 'offline';
      previousHumidity[key] = sensor.humidity;
    });
  };
})(window);
