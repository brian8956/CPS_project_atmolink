(function (window) {
  const AtmoLink = window.AtmoLink;
  const MIN_SIZE = 10;
  let rafPending = false;

  function getStage() {
    return document.getElementById('heatmap-stage');
  }

  function modelSize() {
    return AtmoLink.config.heatmapSize;
  }

  // 取得「顯示像素 -> 模型座標(0~320)」的縮放比例。
  function scaleFactor() {
    const stage = getStage();
    const rect = stage.getBoundingClientRect();
    return modelSize() / (rect.width || modelSize());
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function markDirtyAndRedraw() {
    AtmoLink.state.layoutDirty = true;
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      AtmoLink.drawHeatmap();
    });
  }

  function applyGeometry(el, p) {
    const size = modelSize();
    el.style.left = `${(p.x / size) * 100}%`;
    el.style.top = `${(p.y / size) * 100}%`;
    el.style.width = `${(p.w / size) * 100}%`;
    el.style.height = `${(p.h / size) * 100}%`;
  }

  function startDrag(event, partition, el, mode) {
    event.preventDefault();
    event.stopPropagation();
    AtmoLink.state.selectedPartitionId = partition.id;
    AtmoLink.renderPartitionLayer();
    const layer = document.getElementById('partition-layer');
    const liveEl = layer.querySelector(`[data-id="${partition.id}"]`);
    const scale = scaleFactor();
    const startX = event.clientX;
    const startY = event.clientY;
    const orig = { x: partition.x, y: partition.y, w: partition.w, h: partition.h };
    const size = modelSize();

    function onMove(moveEvent) {
      const dx = (moveEvent.clientX - startX) * scale;
      const dy = (moveEvent.clientY - startY) * scale;
      if (mode === 'move') {
        partition.x = clamp(orig.x + dx, 0, size - partition.w);
        partition.y = clamp(orig.y + dy, 0, size - partition.h);
      } else {
        partition.w = clamp(orig.w + dx, MIN_SIZE, size - partition.x);
        partition.h = clamp(orig.h + dy, MIN_SIZE, size - partition.y);
      }
      applyGeometry(liveEl, partition);
      markDirtyAndRedraw();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      markDirtyAndRedraw();
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function buildPartitionEl(partition) {
    const el = document.createElement('div');
    el.className = `partition partition-${partition.type}`;
    el.dataset.id = partition.id;
    if (partition.id === AtmoLink.state.selectedPartitionId) el.classList.add('selected');
    if (partition.type === 'door' && AtmoLink.state.doorOpen) el.classList.add('open');
    applyGeometry(el, partition);

    const label = document.createElement('span');
    label.className = 'partition-label';
    label.textContent = partition.type === 'door'
      ? (AtmoLink.state.doorOpen ? '門·開' : '門·關')
      : '隔板';
    el.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'partition-remove';
    remove.textContent = '×';
    remove.title = '刪除';
    remove.addEventListener('pointerdown', (e) => e.stopPropagation());
    remove.addEventListener('click', (e) => {
      e.stopPropagation();
      AtmoLink.state.partitions = AtmoLink.state.partitions.filter((p) => p.id !== partition.id);
      if (AtmoLink.state.selectedPartitionId === partition.id) AtmoLink.state.selectedPartitionId = null;
      AtmoLink.renderPartitionLayer();
      markDirtyAndRedraw();
    });
    el.appendChild(remove);

    const handle = document.createElement('div');
    handle.className = 'partition-resize';
    handle.addEventListener('pointerdown', (e) => startDrag(e, partition, el, 'resize'));
    el.appendChild(handle);

    el.addEventListener('pointerdown', (e) => startDrag(e, partition, el, 'move'));
    return el;
  }

  AtmoLink.renderPartitionLayer = function renderPartitionLayer() {
    const layer = document.getElementById('partition-layer');
    if (!layer) return;
    layer.innerHTML = '';
    AtmoLink.state.partitions.forEach((partition) => {
      layer.appendChild(buildPartitionEl(partition));
    });
  };

  function addPartition(type) {
    const size = modelSize();
    const id = `${type}-${Date.now().toString(36)}`;
    const partition = type === 'door'
      ? { id, type: 'door', x: size / 2 - 6, y: size * 0.18, w: 12, h: size * 0.3 }
      : { id, type: 'wall', x: size * 0.35, y: size / 2 - 6, w: size * 0.3, h: 12 };
    AtmoLink.state.partitions.push(partition);
    AtmoLink.state.selectedPartitionId = id;
    AtmoLink.renderPartitionLayer();
    markDirtyAndRedraw();
  }

  AtmoLink.bindPartitionControls = function bindPartitionControls() {
    document.getElementById('add-wall').addEventListener('click', () => addPartition('wall'));
    document.getElementById('add-door').addEventListener('click', () => addPartition('door'));
    document.getElementById('reset-layout').addEventListener('click', () => {
      AtmoLink.state.partitions = AtmoLink.config.defaultPartitions();
      AtmoLink.state.selectedPartitionId = null;
      AtmoLink.renderPartitionLayer();
      markDirtyAndRedraw();
    });
    const layer = document.getElementById('partition-layer');
    if (layer) {
      layer.addEventListener('pointerdown', (e) => {
        if (e.target === layer) {
          AtmoLink.state.selectedPartitionId = null;
          AtmoLink.renderPartitionLayer();
        }
      });
    }
    window.addEventListener('resize', () => {
      if (AtmoLink.renderPartitionLayer) AtmoLink.renderPartitionLayer();
    });
  };
})(window);
