(function (window) {
  const AtmoLink = window.AtmoLink;
  const MIN_SIZE = 10;
  let rafPending = false;

  function getStage() {
    return document.getElementById('heatmap-stage');
  }

  function modelWidth() {
    return AtmoLink.config.heatmapWidth;
  }

  function modelHeight() {
    return AtmoLink.config.heatmapHeight;
  }

  // Get the display-pixel to model-coordinate scale factor.
  function scaleFactor() {
    const stage = getStage();
    const rect = stage.getBoundingClientRect();
    return {
      x: modelWidth() / (rect.width || modelWidth()),
      y: modelHeight() / (rect.height || modelHeight())
    };
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
    el.style.left = `${(p.x / modelWidth()) * 100}%`;
    el.style.top = `${(p.y / modelHeight()) * 100}%`;
    el.style.width = `${(p.w / modelWidth()) * 100}%`;
    el.style.height = `${(p.h / modelHeight()) * 100}%`;
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
    const width = modelWidth();
    const height = modelHeight();

    function onMove(moveEvent) {
      const dx = (moveEvent.clientX - startX) * scale.x;
      const dy = (moveEvent.clientY - startY) * scale.y;
      if (mode === 'move') {
        partition.x = clamp(orig.x + dx, 0, width - partition.w);
        partition.y = clamp(orig.y + dy, 0, height - partition.h);
      } else {
        partition.w = clamp(orig.w + dx, MIN_SIZE, width - partition.x);
        partition.h = clamp(orig.h + dy, MIN_SIZE, height - partition.y);
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
    const labels = {
      shelf: 'Shelf',
      equipment: 'Equipment',
      wall: 'Shelf',
      door: AtmoLink.state.doorOpen ? 'Door open' : 'Door closed'
    };
    label.textContent = labels[partition.type] || 'Obstacle';
    el.appendChild(label);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'partition-remove';
    remove.textContent = '×';
    remove.title = 'Remove';
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
    const id = `${type}-${Date.now().toString(36)}`;
    const partition = type === 'equipment'
      ? { id, type: 'equipment', x: 42, y: modelHeight() * 0.42, w: modelWidth() - 84, h: 38 }
      : { id, type: 'shelf', x: 34, y: modelHeight() * 0.52, w: modelWidth() - 68, h: 10 };
    AtmoLink.state.partitions.push(partition);
    AtmoLink.state.selectedPartitionId = id;
    AtmoLink.renderPartitionLayer();
    markDirtyAndRedraw();
  }

  AtmoLink.bindPartitionControls = function bindPartitionControls() {
    document.getElementById('add-shelf').addEventListener('click', () => addPartition('shelf'));
    document.getElementById('add-equipment').addEventListener('click', () => addPartition('equipment'));
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
