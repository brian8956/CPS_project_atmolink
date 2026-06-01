(function (window) {
  const AtmoLink = window.AtmoLink;

  const NEIGHBORS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // 將隔板/關閉的門光柵化為阻擋格點。
  function rasterizeWalls(grid, partitions, doorOpen) {
    const { resolution, cell } = grid;
    const blocked = new Uint8Array(resolution * resolution);
    partitions.forEach((p) => {
      const isBlocking = p.type === 'wall' || (p.type === 'door' && !doorOpen);
      if (!isBlocking) return;
      const gx0 = Math.floor(p.x / cell);
      const gx1 = Math.ceil((p.x + p.w) / cell);
      const gy0 = Math.floor(p.y / cell);
      const gy1 = Math.ceil((p.y + p.h) / cell);
      for (let gy = Math.max(0, gy0); gy < Math.min(resolution, gy1); gy += 1) {
        for (let gx = Math.max(0, gx0); gx < Math.min(resolution, gx1); gx += 1) {
          blocked[gy * resolution + gx] = 1;
        }
      }
    });
    return blocked;
  }

  // 感測器落在牆內時，往外找最近的可通行格點當作起點。
  function nearestFreeCell(blocked, resolution, gx, gy) {
    const start = gy * resolution + gx;
    if (!blocked[start]) return [gx, gy];
    const queue = [[gx, gy]];
    const seen = new Set([start]);
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= resolution || ny >= resolution) continue;
        const ni = ny * resolution + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        if (!blocked[ni]) return [nx, ny];
        queue.push([nx, ny]);
      }
    }
    return [gx, gy];
  }

  // 單源 Dijkstra：計算繞過牆壁的最短測地線距離場。
  function geodesicField(blocked, resolution, srcX, srcY) {
    const total = resolution * resolution;
    const dist = new Float32Array(total).fill(Infinity);
    const heapIdx = new Int32Array(total + 1);
    const heapDist = new Float32Array(total + 1);
    let heapSize = 0;

    function push(d, i) {
      heapSize += 1;
      let c = heapSize;
      heapDist[c] = d;
      heapIdx[c] = i;
      while (c > 1) {
        const parent = c >> 1;
        if (heapDist[parent] <= heapDist[c]) break;
        [heapDist[parent], heapDist[c]] = [heapDist[c], heapDist[parent]];
        [heapIdx[parent], heapIdx[c]] = [heapIdx[c], heapIdx[parent]];
        c = parent;
      }
    }
    function pop() {
      const topIdx = heapIdx[1];
      heapDist[1] = heapDist[heapSize];
      heapIdx[1] = heapIdx[heapSize];
      heapSize -= 1;
      let c = 1;
      for (;;) {
        const l = c * 2;
        const r = l + 1;
        let s = c;
        if (l <= heapSize && heapDist[l] < heapDist[s]) s = l;
        if (r <= heapSize && heapDist[r] < heapDist[s]) s = r;
        if (s === c) break;
        [heapDist[s], heapDist[c]] = [heapDist[c], heapDist[s]];
        [heapIdx[s], heapIdx[c]] = [heapIdx[c], heapIdx[s]];
        c = s;
      }
      return topIdx;
    }

    const startIdx = srcY * resolution + srcX;
    dist[startIdx] = 0;
    push(0, startIdx);

    while (heapSize > 0) {
      const i = pop();
      const d = dist[i];
      const gx = i % resolution;
      const gy = (i / resolution) | 0;
      for (const [dx, dy, w] of NEIGHBORS) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= resolution || ny >= resolution) continue;
        const ni = ny * resolution + nx;
        if (blocked[ni]) continue;
        // 不允許從牆角的對角縫隙穿過。
        if (dx !== 0 && dy !== 0 && blocked[gy * resolution + nx] && blocked[ny * resolution + gx]) continue;
        const nd = d + w;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          push(nd, ni);
        }
      }
    }
    return dist;
  }

  // 把 NaN（牆內/不可達）格點以鄰居平均逐步填補，避免邊緣破洞。
  function dilateField(values, resolution, passes) {
    for (let p = 0; p < passes; p += 1) {
      const copy = values.slice();
      let changed = false;
      for (let i = 0; i < values.length; i += 1) {
        if (!Number.isNaN(values[i])) continue;
        const gx = i % resolution;
        const gy = (i / resolution) | 0;
        let sum = 0;
        let count = 0;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= resolution || ny >= resolution) continue;
          const v = values[ny * resolution + nx];
          if (!Number.isNaN(v)) { sum += v; count += 1; }
        }
        if (count > 0) { copy[i] = sum / count; changed = true; }
      }
      values.set(copy);
      if (!changed) break;
    }
  }

  function sampleField(values, resolution, fx, fy) {
    const x0 = clamp(Math.floor(fx), 0, resolution - 1);
    const y0 = clamp(Math.floor(fy), 0, resolution - 1);
    const x1 = Math.min(x0 + 1, resolution - 1);
    const y1 = Math.min(y0 + 1, resolution - 1);
    const tx = clamp(fx - x0, 0, 1);
    const ty = clamp(fy - y0, 0, 1);
    const corners = [
      [x0, y0, (1 - tx) * (1 - ty)],
      [x1, y0, tx * (1 - ty)],
      [x0, y1, (1 - tx) * ty],
      [x1, y1, tx * ty]
    ];
    let sum = 0;
    let weight = 0;
    for (const [xx, yy, ww] of corners) {
      const v = values[yy * resolution + xx];
      if (!Number.isNaN(v)) { sum += v * ww; weight += ww; }
    }
    return weight > 0 ? sum / weight : NaN;
  }

  // 只在格局（隔板/門）改變時重算測地線距離場並快取。
  AtmoLink.computeGeoFields = function computeGeoFields() {
    const { gridResolution, heatmapSize, positions, nodes } = AtmoLink.config;
    const { partitions, doorOpen } = AtmoLink.state;
    const grid = { resolution: gridResolution, cell: heatmapSize / gridResolution };
    const blocked = rasterizeWalls(grid, partitions, doorOpen);

    const fields = {};
    nodes.forEach((key) => {
      const [sx, sy] = positions[key];
      let gx = clamp(Math.round(sx / grid.cell - 0.5), 0, grid.resolution - 1);
      let gy = clamp(Math.round(sy / grid.cell - 0.5), 0, grid.resolution - 1);
      [gx, gy] = nearestFreeCell(blocked, grid.resolution, gx, gy);
      fields[key] = geodesicField(blocked, grid.resolution, gx, gy);
    });

    AtmoLink.state.geoFields = { fields, blocked, resolution: grid.resolution, cell: grid.cell };
    AtmoLink.state.layoutDirty = false;
  };

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
      AtmoLink.state.layoutDirty = true;
      const label = AtmoLink.state.doorOpen ? '開' : '關';
      document.getElementById('door-toggle').textContent = `門狀態：${label}`;
      document.getElementById('door-label').textContent = AtmoLink.state.doorOpen ? '開啟' : '關閉';
      if (AtmoLink.renderPartitionLayer) AtmoLink.renderPartitionLayer();
      AtmoLink.drawHeatmap();
    });
  };

  AtmoLink.drawHeatmap = function drawHeatmap() {
    const { colors, nodes, positions, idwPower } = AtmoLink.config;
    const { sensors, selectedField } = AtmoLink.state;
    const canvas = document.getElementById('heatmap');
    if (!canvas) return;
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

    if (AtmoLink.state.layoutDirty || !AtmoLink.state.geoFields) {
      AtmoLink.computeGeoFields();
    }
    const { fields, resolution, cell } = AtmoLink.state.geoFields;

    const unit = selectedField === 'humidity' ? '%RH' : '°C';
    const minV = Math.min(...values) - (selectedField === 'humidity' ? 3 : 0.8);
    const maxV = Math.max(...values) + (selectedField === 'humidity' ? 3 : 0.8);
    const toColor = (value) => {
      const t = clamp((value - minV) / Math.max(0.001, maxV - minV), 0, 1);
      return selectedField === 'humidity'
        ? [Math.round(30 + t * 30), Math.round(110 + t * 70), Math.round(210 - t * 150)]
        : [Math.round(40 + t * 215), Math.round(130 - t * 45), Math.round(220 - t * 175)];
    };

    // 以測地線距離做 IDW 內插，建立每格的內插值場。
    const valueField = new Float32Array(resolution * resolution).fill(NaN);
    for (let i = 0; i < valueField.length; i += 1) {
      let wSum = 0;
      let vSum = 0;
      for (const key of nodes) {
        const d = fields[key][i];
        if (!Number.isFinite(d)) continue;
        const weight = 1 / (Math.pow(d, idwPower) + 1e-3);
        wSum += weight;
        vSum += weight * sensors[key][selectedField];
      }
      if (wSum > 0) valueField[i] = vSum / wSum;
    }
    dilateField(valueField, resolution, Math.ceil(14 / cell) + 2);

    const img = ctx.createImageData(width, height);
    for (let py = 0; py < height; py += 1) {
      const fy = py / cell - 0.5;
      for (let px = 0; px < width; px += 1) {
        const v = sampleField(valueField, resolution, px / cell - 0.5, fy);
        const i = (py * width + px) * 4;
        if (Number.isNaN(v)) {
          img.data[i] = 24; img.data[i + 1] = 28; img.data[i + 2] = 35; img.data[i + 3] = 255;
        } else {
          const [r, g, b] = toColor(v);
          img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 225;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    // 感測器節點標記。
    nodes.forEach((key) => {
      const [x, y] = positions[key];
      const value = sensors[key][selectedField];
      ctx.beginPath();
      ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10,12,16,0.86)';
      ctx.fill();
      ctx.strokeStyle = colors[key];
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = colors[key];
      ctx.font = 'bold 12px Syne';
      ctx.textAlign = 'center';
      ctx.fillText(key, x, y + 4);
      ctx.fillStyle = '#e8eaf0';
      ctx.font = '9px DM Mono';
      const labelY = y < height / 2 ? y + 29 : y - 20;
      ctx.fillText(`${value.toFixed(1)} ${unit}`, x, labelY);
    });

    const sensorValues = nodes.map((key) => ({ key, value: sensors[key][selectedField] }));
    const hotspot = sensorValues.reduce((a, b) => (a.value > b.value ? a : b));
    document.getElementById('hotspot-label').textContent = `Node ${hotspot.key}`;
    const gx = (sensors.B[selectedField] + sensors.D[selectedField]) / 2 - (sensors.A[selectedField] + sensors.C[selectedField]) / 2;
    const gy = (sensors.C[selectedField] + sensors.D[selectedField]) / 2 - (sensors.A[selectedField] + sensors.B[selectedField]) / 2;
    const magnitude = Math.sqrt(gx * gx + gy * gy);

    document.getElementById('gradient-info').textContent =
      `${selectedField === 'humidity' ? '濕度' : '溫度'}梯度強度 ${magnitude.toFixed(2)} ${unit}。${AtmoLink.state.doorOpen ? '門扉開啟，氣流可繞過上方缺口擴散。' : '門扉關閉，BFS 視距被切斷，熱力邊界停在門前。'}`;
    document.getElementById('legend-bar').style.background =
      `linear-gradient(to right, rgb(${toColor(minV).join(',')}), rgb(${toColor(maxV).join(',')}))`;
    document.getElementById('leg-min').textContent = `${minV.toFixed(1)}${unit}`;
    document.getElementById('leg-max').textContent = `${maxV.toFixed(1)}${unit}`;
  };
})(window);
