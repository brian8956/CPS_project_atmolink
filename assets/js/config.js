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
      A: [34, 34],
      B: [286, 34],
      C: [34, 286],
      D: [286, 286]
    },
    heatmapSize: 320,
    gridResolution: 72,
    idwPower: 2,
    defaultPartitions: function defaultPartitions() {
      return [
        { id: 'door-1', type: 'door', x: 154, y: 30, w: 12, h: 118 },
        { id: 'wall-1', type: 'wall', x: 154, y: 172, w: 12, h: 118 }
      ];
    },
    maxPoints: 50,
    offlineMs: 6000,
    nodes: ['A', 'B', 'C', 'D']
  };

  window.AtmoLink = AtmoLink;
})(window);
