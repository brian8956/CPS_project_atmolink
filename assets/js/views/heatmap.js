(function (window) {
  const AtmoLink = window.AtmoLink;

  const NEIGHBORS = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // 將層板、設備與關閉的門光柵化為阻擋格點。
  function rasterizeWalls(grid, partitions, doorOpen) {
    const { cols, rows, cellX, cellY } = grid;
    const blocked = new Uint8Array(cols * rows);
    partitions.forEach((p) => {
      const isBlocking = p.type === 'shelf' || p.type === 'equipment' || p.type === 'wall' || (p.type === 'door' && !doorOpen);
      if (!isBlocking) return;
      const gx0 = Math.floor(p.x / cellX);
      const gx1 = Math.ceil((p.x + p.w) / cellX);
      const gy0 = Math.floor(p.y / cellY);
      const gy1 = Math.ceil((p.y + p.h) / cellY);
      for (let gy = Math.max(0, gy0); gy < Math.min(rows, gy1); gy += 1) {
        for (let gx = Math.max(0, gx0); gx < Math.min(cols, gx1); gx += 1) {
          blocked[gy * cols + gx] = 1;
        }
      }
    });
    return blocked;
  }

  // 感測器落在牆內時，往外找最近的可通行格點當作起點。
  function nearestFreeCell(blocked, cols, rows, gx, gy) {
    const start = gy * cols + gx;
    if (!blocked[start]) return [gx, gy];
    const queue = [[gx, gy]];
    const seen = new Set([start]);
    while (queue.length) {
      const [x, y] = queue.shift();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (seen.has(ni)) continue;
        seen.add(ni);
        if (!blocked[ni]) return [nx, ny];
        queue.push([nx, ny]);
      }
    }
    return [gx, gy];
  }

  // 單源 Dijkstra：計算繞過牆壁的最短測地線距離場。
  function geodesicField(blocked, grid, srcX, srcY, diffusionMode) {
    const { cols, rows, cellX, cellY } = grid;
    const total = cols * rows;
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

    const startIdx = srcY * cols + srcX;
    dist[startIdx] = 0;
    push(0, startIdx);

    while (heapSize > 0) {
      const i = pop();
      const d = dist[i];
      const gx = i % cols;
      const gy = (i / cols) | 0;
      for (const [dx, dy, w] of NEIGHBORS) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const ni = ny * cols + nx;
        if (blocked[ni]) continue;
        // 不允許從牆角的對角縫隙穿過。
        if (dx !== 0 && dy !== 0 && blocked[gy * cols + nx] && blocked[ny * cols + gx]) continue;
        const physicalStep = Math.sqrt((dx * cellX) ** 2 + (dy * cellY) ** 2);
        let directionPenalty = 1;
        if (diffusionMode === 'buoyancy') {
          if (dy < 0) directionPenalty = 0.78;
          else if (dy > 0) directionPenalty = 1.48;
        }
        const nd = d + physicalStep * directionPenalty;
        if (nd < dist[ni]) {
          dist[ni] = nd;
          push(nd, ni);
        }
      }
    }
    return dist;
  }

  // 把 NaN（牆內/不可達）格點以鄰居平均逐步填補，避免邊緣破洞。
  function dilateField(values, cols, rows, passes) {
    for (let p = 0; p < passes; p += 1) {
      const copy = values.slice();
      let changed = false;
      for (let i = 0; i < values.length; i += 1) {
        if (!Number.isNaN(values[i])) continue;
        const gx = i % cols;
        const gy = (i / cols) | 0;
        let sum = 0;
        let count = 0;
        for (const [dx, dy] of NEIGHBORS) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const v = values[ny * cols + nx];
          if (!Number.isNaN(v)) { sum += v; count += 1; }
        }
        if (count > 0) { copy[i] = sum / count; changed = true; }
      }
      values.set(copy);
      if (!changed) break;
    }
  }

  function sampleField(values, cols, rows, fx, fy) {
    const x0 = clamp(Math.floor(fx), 0, cols - 1);
    const y0 = clamp(Math.floor(fy), 0, rows - 1);
    const x1 = Math.min(x0 + 1, cols - 1);
    const y1 = Math.min(y0 + 1, rows - 1);
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
      const v = values[yy * cols + xx];
      if (!Number.isNaN(v)) { sum += v * ww; weight += ww; }
    }
    return weight > 0 ? sum / weight : NaN;
  }

  function rackUnitFromY(y, height) {
    const t = clamp((y - 22) / Math.max(1, height - 44), 0, 0.999);
    return clamp(12 - Math.floor(t * 12), 1, 12);
  }

  function drawRackGuides(ctx, width, height) {
    ctx.save();
    ctx.strokeStyle = 'rgba(232,234,240,0.34)';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 12, width - 36, height - 24);

    ctx.strokeStyle = 'rgba(232,234,240,0.13)';
    ctx.lineWidth = 1;
    ctx.font = '9px DM Mono';
    ctx.fillStyle = 'rgba(232,234,240,0.62)';
    ctx.textAlign = 'left';
    for (let i = 0; i <= 12; i += 1) {
      const y = 22 + ((height - 44) * i) / 12;
      ctx.beginPath();
      ctx.moveTo(18, y);
      ctx.lineTo(width - 18, y);
      ctx.stroke();
      if (i < 12) ctx.fillText(`U${12 - i}`, 24, y + 12);
    }

    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = 'rgba(96,165,250,0.78)';
    ctx.textAlign = 'center';
    ctx.fillText('前門 / 冷通道', 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(width - 12, height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = 'rgba(248,113,113,0.78)';
    ctx.textAlign = 'center';
    ctx.fillText('後門 / 熱通道', 0, 0);
    ctx.restore();

    ctx.strokeStyle = 'rgba(232,234,240,0.2)';
    ctx.setLineDash([4, 5]);
    ctx.beginPath();
    ctx.moveTo(width / 2, 12);
    ctx.lineTo(width / 2, height - 12);
    ctx.stroke();
    ctx.restore();
  }

  // 只在格局、節點位置或擴散模型改變時重算測地線距離場並快取。
  AtmoLink.computeGeoFields = function computeGeoFields() {
    const { gridResolution, heatmapWidth, heatmapHeight, nodes } = AtmoLink.config;
    const { partitions, doorOpen, nodePositions, diffusionMode } = AtmoLink.state;
    const rows = gridResolution;
    const cols = Math.max(24, Math.round((heatmapWidth / heatmapHeight) * rows));
    const grid = { cols, rows, cellX: heatmapWidth / cols, cellY: heatmapHeight / rows };
    const blocked = rasterizeWalls(grid, partitions, doorOpen);

    const fields = {};
    nodes.forEach((key) => {
      const [sx, sy] = nodePositions[key];
      let gx = clamp(Math.round(sx / grid.cellX - 0.5), 0, grid.cols - 1);
      let gy = clamp(Math.round(sy / grid.cellY - 0.5), 0, grid.rows - 1);
      [gx, gy] = nearestFreeCell(blocked, grid.cols, grid.rows, gx, gy);
      fields[key] = geodesicField(blocked, grid, gx, gy, diffusionMode);
    });

    AtmoLink.state.geoFields = { fields, blocked, cols: grid.cols, rows: grid.rows, cellX: grid.cellX, cellY: grid.cellY };
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

    document.getElementById('heat-mode-toggle').addEventListener('click', () => {
      AtmoLink.state.diffusionMode = AtmoLink.state.diffusionMode === 'buoyancy' ? 'standard' : 'buoyancy';
      AtmoLink.state.layoutDirty = true;
      const label = AtmoLink.state.diffusionMode === 'buoyancy' ? '熱浮力' : '標準';
      document.getElementById('heat-mode-toggle').textContent = `擴散：${label}`;
      document.getElementById('diffusion-label').textContent = `${label} · p${AtmoLink.config.idwPower}`;
      AtmoLink.drawHeatmap();
    });

    document.getElementById('reset-nodes').addEventListener('click', () => {
      AtmoLink.state.nodePositions = Object.fromEntries(
        AtmoLink.config.nodes.map((key) => [key, [...AtmoLink.config.positions[key]]])
      );
      AtmoLink.state.layoutDirty = true;
      AtmoLink.drawHeatmap();
    });

    bindSensorDrag();
  };

  function bindSensorDrag() {
    const stage = document.getElementById('heatmap-stage');
    if (!stage) return;
    let draggingKey = null;

    function stagePoint(event) {
      const rect = stage.getBoundingClientRect();
      return [
        ((event.clientX - rect.left) / rect.width) * AtmoLink.config.heatmapWidth,
        ((event.clientY - rect.top) / rect.height) * AtmoLink.config.heatmapHeight
      ];
    }

    stage.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.partition')) return;
      const [x, y] = stagePoint(event);
      const hit = AtmoLink.config.nodes.find((key) => {
        const [nx, ny] = AtmoLink.state.nodePositions[key];
        return Math.hypot(nx - x, ny - y) <= 22;
      });
      if (!hit) {
        AtmoLink.state.selectedPartitionId = null;
        if (AtmoLink.renderPartitionLayer) AtmoLink.renderPartitionLayer();
        return;
      }
      draggingKey = hit;
      stage.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    stage.addEventListener('pointermove', (event) => {
      if (!draggingKey) return;
      const [x, y] = stagePoint(event);
      AtmoLink.state.nodePositions[draggingKey] = [
        clamp(x, 14, AtmoLink.config.heatmapWidth - 14),
        clamp(y, 14, AtmoLink.config.heatmapHeight - 14)
      ];
      AtmoLink.state.layoutDirty = true;
      AtmoLink.drawHeatmap();
    });

    stage.addEventListener('pointerup', () => {
      draggingKey = null;
    });

    stage.addEventListener('pointercancel', () => {
      draggingKey = null;
    });
  }

  AtmoLink.drawHeatmap = function drawHeatmap() {
    const { colors, nodes, idwPower } = AtmoLink.config;
    const { sensors, selectedField, nodePositions, diffusionMode } = AtmoLink.state;
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
    const { fields, cols, rows, cellX, cellY } = AtmoLink.state.geoFields;

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
    const valueField = new Float32Array(cols * rows).fill(NaN);
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
    dilateField(valueField, cols, rows, Math.ceil(14 / Math.min(cellX, cellY)) + 2);

    const img = ctx.createImageData(width, height);
    for (let py = 0; py < height; py += 1) {
      const fy = py / cellY - 0.5;
      for (let px = 0; px < width; px += 1) {
        const v = sampleField(valueField, cols, rows, px / cellX - 0.5, fy);
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
    drawRackGuides(ctx, width, height);

    // 感測器節點標記。
    nodes.forEach((key) => {
      const [x, y] = nodePositions[key];
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
    const topKeys = nodes.filter((key) => nodePositions[key][1] < height / 2);
    const bottomKeys = nodes.filter((key) => nodePositions[key][1] >= height / 2);
    const leftKeys = nodes.filter((key) => nodePositions[key][0] < width / 2);
    const rightKeys = nodes.filter((key) => nodePositions[key][0] >= width / 2);
    const avg = (keys) => keys.length
      ? keys.reduce((sum, key) => sum + sensors[key][selectedField], 0) / keys.length
      : NaN;
    const gx = avg(rightKeys) - avg(leftKeys);
    const gy = avg(topKeys) - avg(bottomKeys);
    const magnitude = Math.sqrt(gx * gx + gy * gy);
    const verticalDelta = gy;
    const frontBackDelta = gx;
    const hotspotUnit = rackUnitFromY(nodePositions[hotspot.key][1], height);
    const layerSummary = nodes
      .map((key) => `${key}:U${rackUnitFromY(nodePositions[key][1], height)}`)
      .join(' ');
    const shelfCount = AtmoLink.state.partitions.filter((p) => p.type === 'shelf' || p.type === 'wall').length;
    const equipmentCount = AtmoLink.state.partitions.filter((p) => p.type === 'equipment').length;
    const modeLabel = diffusionMode === 'buoyancy' ? '熱浮力' : '標準';
    const fieldLabel = selectedField === 'humidity' ? '濕度' : '溫度';
    const directionText = [
      Number.isFinite(verticalDelta)
        ? (verticalDelta >= 0 ? `上層比下層高 ${Math.abs(verticalDelta).toFixed(1)} ${unit}` : `下層比上層高 ${Math.abs(verticalDelta).toFixed(1)} ${unit}`)
        : '上下差暫無法判讀',
      Number.isFinite(frontBackDelta)
        ? (frontBackDelta >= 0 ? `後側比前側高 ${Math.abs(frontBackDelta).toFixed(1)} ${unit}` : `前側比後側高 ${Math.abs(frontBackDelta).toFixed(1)} ${unit}`)
        : '前後差暫無法判讀'
    ].join('；');

    document.getElementById('hotspot-label').textContent = `Node ${hotspot.key} · U${hotspotUnit}`;
    document.getElementById('vertical-delta-label').textContent = Number.isFinite(verticalDelta) ? `${verticalDelta >= 0 ? '+' : ''}${verticalDelta.toFixed(1)} ${unit}` : '--';
    document.getElementById('front-back-label').textContent = Number.isFinite(frontBackDelta) ? `${frontBackDelta >= 0 ? '+' : ''}${frontBackDelta.toFixed(1)} ${unit}` : '--';
    document.getElementById('node-layer-label').textContent = layerSummary;
    document.getElementById('layout-count-label').textContent = `${shelfCount} 層板 · ${equipmentCount} 設備`;
    document.getElementById('diffusion-label').textContent = `${modeLabel} · p${idwPower}`;
    document.getElementById('rack-summary').textContent =
      `${fieldLabel}梯度強度 ${Number.isFinite(magnitude) ? magnitude.toFixed(2) : '--'} ${unit}。${directionText}。${modeLabel}模式${diffusionMode === 'buoyancy' ? '會讓熱區較容易向上延伸。' : '僅依距離與障礙物計算擴散。'}`;
    document.getElementById('legend-bar').style.background =
      `linear-gradient(to right, rgb(${toColor(minV).join(',')}), rgb(${toColor(maxV).join(',')}))`;
    document.getElementById('leg-min').textContent = `${minV.toFixed(1)}${unit}`;
    document.getElementById('leg-max').textContent = `${maxV.toFixed(1)}${unit}`;
  };
})(window);
