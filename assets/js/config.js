(function (window) {
  const AtmoLink = window.AtmoLink || {};

  AtmoLink.config = {
    brokerUrl: 'wss://2aff883c85d24676a738e310f0dbc71d.s1.eu.hivemq.cloud:8884/mqtt',
    mqttCredentialsStorageKey: 'atmolink:mqtt-credentials',
    topics: {
      A: 'room/sensor/A',
      B: 'room/sensor/B',
      C: 'room/sensor/C',
      D: 'room/sensor/D'
    },
    colors: {
      A: '#60a5fa',
      B: '#34d399',
      C: '#f87171',
      D: '#fbbf24'
    },
    heights: {
      A: 0.1,
      B: 0.6,
      C: 1.1,
      D: 1.7
    },
    heightMin: 0,
    heightMax: 3.0,
    positions: {
      A: [86, 70],
      B: [234, 185],
      C: [86, 355],
      D: [234, 505]
    },
    heatmapWidth: 320,
    heatmapHeight: 560,
    heatmapSize: 320,
    gridResolution: 92,
    idwPower: 2,
    defaultPartitions: function defaultPartitions() {
      return [
        { id: 'equipment-1', type: 'equipment', x: 42, y: 138, w: 236, h: 34 },
        { id: 'shelf-1', type: 'shelf', x: 34, y: 288, w: 252, h: 10 },
        { id: 'equipment-2', type: 'equipment', x: 42, y: 418, w: 236, h: 42 }
      ];
    },
    maxPoints: 50,
    offlineMs: 6000,
    nodes: ['A', 'B', 'C', 'D']
  };

  window.AtmoLink = AtmoLink;
})(window);
