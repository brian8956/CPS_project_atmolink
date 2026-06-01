(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.renderStratificationView = function renderStratificationView() {
    const { heights, colors } = AtmoLink.config;

    document.getElementById('tower').innerHTML = `
      <div class="tower-axis">
        ${Object.entries(heights).map(([key, height]) => {
          const y = 100 - (height / 1.7 * 88 + 6);
          return `<div class="height-line" style="top:${y}%"></div><div class="height-tick" style="top:${y}%">${height}m</div>`;
        }).join('')}
      </div>
      <div class="tower-body">
        ${Object.entries(heights).map(([key, height]) => {
          const y = 100 - (height / 1.7 * 88 + 6);
          return `
            <div class="height-node" style="top:${y}%">
              <b style="color:${colors[key]}">${key}</b>
              <span id="height-temp-${key}">-- °C</span>
              <span id="height-hum-${key}">-- %RH</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  };

  AtmoLink.updateStratification = function updateStratification() {
    const { nodes } = AtmoLink.config;
    const { sensors } = AtmoLink.state;

    nodes.forEach((key) => {
      const sensor = sensors[key];
      document.getElementById(`height-temp-${key}`).textContent = sensor ? `${sensor.temperature.toFixed(2)} °C` : '-- °C';
      document.getElementById(`height-hum-${key}`).textContent = sensor ? `${sensor.humidity.toFixed(1)} %RH` : '-- %RH';
    });

    const foot = sensors.A?.temperature;
    const head = sensors.C?.temperature;
    const top = sensors.D?.temperature;
    const bottom = sensors.A?.temperature;
    const delta = foot != null && head != null ? head - foot : null;
    const gradient = top != null && bottom != null ? (top - bottom) / 1.6 : null;

    document.querySelector('#delta-metric strong').textContent = delta == null ? '-- °C' : `${delta.toFixed(2)} °C`;
    document.querySelector('#gradient-metric strong').textContent = gradient == null ? '-- °C/m' : `${gradient.toFixed(2)} °C/m`;

    const comfort = document.getElementById('comfort-metric');
    comfort.className = 'metric comfort';
    if (delta == null) {
      comfort.querySelector('strong').textContent = '--';
      return;
    }

    const ppd = Math.min(42, 5 + Math.max(0, Math.abs(delta) - 0.5) * 7.5);
    let label = '舒適';
    let cls = 'good';
    if (Math.abs(delta) >= 3) {
      label = '高風險';
      cls = 'bad';
    } else if (Math.abs(delta) >= 1.8) {
      label = '注意';
      cls = 'warn';
    }
    comfort.classList.add(cls);
    comfort.querySelector('strong').textContent = `${ppd.toFixed(0)}% · ${label}`;
  };
})(window);
