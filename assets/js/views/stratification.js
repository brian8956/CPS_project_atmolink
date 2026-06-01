(function (window) {
  const AtmoLink = window.AtmoLink;
  const TOP_MARGIN = 6;
  const BAND = 88;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Dynamic ceiling: at least 1.7 m, extended when any node is higher.
  function displayMax() {
    const values = Object.values(AtmoLink.state.heights);
    return Math.max(1.7, Math.ceil(Math.max(...values) * 10) / 10);
  }

  function heightToPercent(height) {
    return 100 - ((height / displayMax()) * BAND + TOP_MARGIN);
  }

  function percentToHeight(percent) {
    return ((94 - percent) / BAND) * displayMax();
  }

  function verticalTemperaturePd(delta) {
    if (delta <= 0) return { value: null, label: 'Not applicable: head cooler than ankle', className: 'good' };
    if (delta >= 8) return { value: null, label: 'Out of formula range: dT >= 8°C', className: 'bad' };

    const value = 100 / (1 + Math.exp(5.76 - 0.856 * delta));
    if (delta < 2) return { value, label: 'ISO A', className: 'good' };
    if (delta < 3) return { value, label: 'ISO B', className: 'good' };
    if (delta < 4) return { value, label: 'ISO C', className: 'warn' };
    return { value, label: 'Above ISO C', className: 'bad' };
  }

  AtmoLink.renderStratificationView = function renderStratificationView() {
    const { colors, nodes } = AtmoLink.config;
    const { heights } = AtmoLink.state;

    document.getElementById('tower').innerHTML = `
      <div class="tower-axis">
        ${nodes.map((key) => {
          const y = heightToPercent(heights[key]);
          return `<div class="height-line" id="axis-line-${key}" style="top:${y}%"></div>`
            + `<div class="height-tick" id="axis-tick-${key}" style="top:${y}%">${heights[key].toFixed(2)}m</div>`;
        }).join('')}
      </div>
      <div class="tower-body" id="tower-body">
        ${nodes.map((key) => {
          const y = heightToPercent(heights[key]);
          return `
            <div class="height-node" id="height-node-${key}" data-key="${key}" style="top:${y}%" title="Drag to adjust height">
              <b style="color:${colors[key]}">${key}</b>
              <span class="height-readout">
                <span id="height-temp-${key}">-- °C</span>
                <span id="height-hum-${key}">-- %RH</span>
              </span>
              <label class="height-edit">
                <input type="number" id="height-input-${key}" value="${heights[key].toFixed(2)}"
                  min="${AtmoLink.config.heightMin}" max="${AtmoLink.config.heightMax}" step="0.05">m
              </label>
            </div>
          `;
        }).join('')}
      </div>
    `;

    nodes.forEach((key) => bindNodeDrag(key));
    AtmoLink.updateStratification();
  };

  function setNodePosition(key) {
    const y = heightToPercent(AtmoLink.state.heights[key]);
    const node = document.getElementById(`height-node-${key}`);
    const line = document.getElementById(`axis-line-${key}`);
    const tick = document.getElementById(`axis-tick-${key}`);
    if (node) node.style.top = `${y}%`;
    if (line) line.style.top = `${y}%`;
    if (tick) { tick.style.top = `${y}%`; tick.textContent = `${AtmoLink.state.heights[key].toFixed(2)}m`; }
  }

  // Sync card labels, chart dataset labels, head-ankle delta, and PD after height changes.
  AtmoLink.applyHeights = function applyHeights() {
    const { nodes } = AtmoLink.config;
    const { heights } = AtmoLink.state;
    nodes.forEach((key) => {
      const cardLabel = document.getElementById(`card-h-${key}`);
      if (cardLabel) cardLabel.textContent = `${heights[key].toFixed(2)}m`;
    });
    if (AtmoLink.tempChart) {
      nodes.forEach((key, index) => {
        AtmoLink.tempChart.data.datasets[index].label = `${key} ${heights[key].toFixed(2)}m`;
      });
      AtmoLink.tempChart.update('none');
    }
    AtmoLink.updateStratification();
  };

  function setHeight(key, height, options) {
    const { heightMin, heightMax } = AtmoLink.config;
    AtmoLink.state.heights[key] = clamp(Number(height.toFixed(2)), heightMin, heightMax);
    if (options && options.fullRender) {
      AtmoLink.renderStratificationView();
    } else {
      AtmoLink.config.nodes.forEach((k) => setNodePosition(k));
    }
    const input = document.getElementById(`height-input-${key}`);
    if (input && document.activeElement !== input) input.value = AtmoLink.state.heights[key].toFixed(2);
    AtmoLink.applyHeights();
  }

  function bindNodeDrag(key) {
    const node = document.getElementById(`height-node-${key}`);
    const input = document.getElementById(`height-input-${key}`);
    if (input) {
      input.addEventListener('pointerdown', (e) => e.stopPropagation());
      input.addEventListener('change', () => {
        const value = parseFloat(input.value);
        if (!Number.isNaN(value)) setHeight(key, value, { fullRender: true });
      });
    }

    node.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.height-edit')) return;
      event.preventDefault();
      const body = document.getElementById('tower-body');
      const rect = body.getBoundingClientRect();
      node.classList.add('dragging');

      function onMove(moveEvent) {
        const percent = clamp(((moveEvent.clientY - rect.top) / rect.height) * 100, TOP_MARGIN, 94);
        setHeight(key, percentToHeight(percent));
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        node.classList.remove('dragging');
        AtmoLink.renderStratificationView();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  AtmoLink.bindStratificationControls = function bindStratificationControls() {
    const reset = document.getElementById('reset-heights');
    if (reset) {
      reset.addEventListener('click', () => {
        AtmoLink.state.heights = { ...AtmoLink.config.heights };
        AtmoLink.renderStratificationView();
        AtmoLink.applyHeights();
      });
    }
  };

  AtmoLink.updateStratification = function updateStratification() {
    const { nodes } = AtmoLink.config;
    const { sensors, heights } = AtmoLink.state;

    nodes.forEach((key) => {
      const sensor = sensors[key];
      const tempEl = document.getElementById(`height-temp-${key}`);
      const humEl = document.getElementById(`height-hum-${key}`);
      if (tempEl) tempEl.textContent = sensor ? `${sensor.temperature.toFixed(2)} °C` : '-- °C';
      if (humEl) humEl.textContent = sensor ? `${sensor.humidity.toFixed(1)} %RH` : '-- %RH';
    });

    // Use the lowest available node as ankle height and the highest as head height.
    const ordered = nodes
      .filter((key) => sensors[key] != null)
      .sort((a, b) => heights[a] - heights[b]);

    const deltaLabel = document.getElementById('delta-label');
    const deltaStrong = document.querySelector('#delta-metric strong');
    const comfort = document.getElementById('comfort-metric');

    if (ordered.length < 2) {
      if (deltaLabel) deltaLabel.textContent = 'Head-Ankle Delta T';
      deltaStrong.textContent = '-- °C';
      comfort.className = 'metric comfort';
      comfort.querySelector('strong').textContent = '--';
      return;
    }

    const foot = ordered[0];
    const head = ordered[ordered.length - 1];
    const delta = sensors[head].temperature - sensors[foot].temperature;

    if (deltaLabel) {
      deltaLabel.textContent = `${foot} ${heights[foot].toFixed(2)}m ankle -> ${head} ${heights[head].toFixed(2)}m head`;
    }
    deltaStrong.textContent = `${delta.toFixed(2)} °C`;

    comfort.className = 'metric comfort';
    const pd = verticalTemperaturePd(delta);
    comfort.classList.add(pd.className);
    comfort.querySelector('strong').textContent = pd.value == null
      ? pd.label
      : `${pd.value.toFixed(1)}% dissatisfied`;
  };
})(window);
