(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.bindHeatmapControls = function bindHeatmapControls() {
    document.querySelectorAll('[data-field]').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('[data-field]').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        AtmoLink.state.selectedField = button.dataset.field;
        AtmoLink.drawHeatmap();
      });
    });

    document.getElementById('door-toggle').addEventListener('click', () => {
      AtmoLink.state.doorOpen = !AtmoLink.state.doorOpen;
      const label = AtmoLink.state.doorOpen ? '開' : '關';
      document.getElementById('door-toggle').textContent = `門狀態：${label}`;
      document.getElementById('door-label').textContent = AtmoLink.state.doorOpen ? '開啟' : '關閉';
      AtmoLink.drawHeatmap();
    });
  };

  AtmoLink.drawHeatmap = function drawHeatmap() {
    const { colors, nodes, positions } = AtmoLink.config;
    const { sensors, selectedField, doorOpen } = AtmoLink.state;
    const canvas = document.getElementById('heatmap');
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const values = nodes.map((key) => sensors[key]?.[selectedField]).filter((value) => value != null);

    if (values.length < 4) {
      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = '#181c23';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#8b93a3';
      ctx.font = '13px DM Mono';
      ctx.textAlign = 'center';
      ctx.fillText('等待四個節點資料...', width / 2, height / 2);
      return;
    }

    const unit = selectedField === 'humidity' ? '%RH' : '°C';
    const minV = Math.min(...values) - (selectedField === 'humidity' ? 3 : 0.8);
    const maxV = Math.max(...values) + (selectedField === 'humidity' ? 3 : 0.8);
    const toColor = (value) => {
      const t = Math.max(0, Math.min(1, (value - minV) / Math.max(0.001, maxV - minV)));
      return selectedField === 'humidity'
        ? [Math.round(30 + t * 30), Math.round(110 + t * 70), Math.round(210 - t * 150)]
        : [Math.round(40 + t * 215), Math.round(130 - t * 45), Math.round(220 - t * 175)];
    };
    const sensorPoints = nodes.map((key) => ({
      key,
      x: positions[key][0],
      y: positions[key][1],
      value: sensors[key][selectedField]
    }));
    const img = ctx.createImageData(width, height);

    for (let py = 0; py < height; py += 1) {
      for (let px = 0; px < width; px += 1) {
        let wSum = 0;
        let vSum = 0;
        sensorPoints.forEach((sensor) => {
          const crossesWall = !doorOpen && ((px < width / 2 && sensor.x > width / 2) || (px > width / 2 && sensor.x < width / 2));
          const wallPenalty = crossesWall && py > 82 && py < 238 ? 5 : 1;
          const distance = Math.sqrt((px - sensor.x) ** 2 + (py - sensor.y) ** 2) * wallPenalty + 0.001;
          const weight = 1 / (distance * distance);
          wSum += weight;
          vSum += weight * sensor.value;
        });
        const [r, g, b] = toColor(vSum / wSum);
        const i = (py * width + px) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 225;
      }
    }

    ctx.putImageData(img, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(width / 2, 42);
    ctx.lineTo(width / 2, doorOpen ? 132 : 278);
    ctx.stroke();
    ctx.fillStyle = 'rgba(10,12,16,0.84)';
    ctx.fillRect(130, doorOpen ? 136 : 282, 60, 18);
    ctx.fillStyle = '#e8eaf0';
    ctx.font = '10px DM Mono';
    ctx.textAlign = 'center';
    ctx.fillText(doorOpen ? 'door open' : 'door closed', width / 2, doorOpen ? 149 : 295);

    sensorPoints.forEach((sensor) => {
      ctx.beginPath();
      ctx.arc(sensor.x, sensor.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,12,16,0.86)';
      ctx.fill();
      ctx.strokeStyle = colors[sensor.key];
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = colors[sensor.key];
      ctx.font = 'bold 12px Syne';
      ctx.fillText(sensor.key, sensor.x, sensor.y + 4);
      ctx.fillStyle = '#e8eaf0';
      ctx.font = '9px DM Mono';
      const labelY = sensor.y < height / 2 ? sensor.y + 29 : sensor.y - 20;
      ctx.fillText(`${sensor.value.toFixed(1)} ${unit}`, sensor.x, labelY);
    });

    const hotspot = sensorPoints.reduce((a, b) => a.value > b.value ? a : b);
    document.getElementById('hotspot-label').textContent = `Node ${hotspot.key}`;
    const gx = (sensors.B[selectedField] + sensors.D[selectedField]) / 2 - (sensors.A[selectedField] + sensors.C[selectedField]) / 2;
    const gy = (sensors.C[selectedField] + sensors.D[selectedField]) / 2 - (sensors.A[selectedField] + sensors.B[selectedField]) / 2;
    const magnitude = Math.sqrt(gx * gx + gy * gy);

    document.getElementById('gradient-info').textContent =
      `${selectedField === 'humidity' ? '濕度' : '溫度'}梯度強度 ${magnitude.toFixed(2)} ${unit}。${doorOpen ? '門扉開啟，左右區域可互相擴散。' : '門扉關閉，隔板穿透權重降低，熱力邊界會被限制。'}`;
    document.getElementById('legend-bar').style.background =
      `linear-gradient(to right, rgb(${toColor(minV).join(',')}), rgb(${toColor(maxV).join(',')}))`;
    document.getElementById('leg-min').textContent = `${minV.toFixed(1)}${unit}`;
    document.getElementById('leg-max').textContent = `${maxV.toFixed(1)}${unit}`;
  };
})(window);
