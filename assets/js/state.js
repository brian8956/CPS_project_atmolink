(function (window) {
  const AtmoLink = window.AtmoLink;
  const { nodes } = AtmoLink.config;

  AtmoLink.state = {
    sensors: Object.fromEntries(nodes.map((key) => [key, null])),
    heights: { ...AtmoLink.config.heights },
    history: {
      labels: [],
      temp: Object.fromEntries(nodes.map((key) => [key, []]))
    },
    previousHumidity: Object.fromEntries(nodes.map((key) => [key, null])),
    selectedField: 'humidity',
    diffusionMode: 'buoyancy',
    doorOpen: true,
    nodePositions: Object.fromEntries(nodes.map((key) => [key, [...AtmoLink.config.positions[key]]])),
    partitions: AtmoLink.config.defaultPartitions(),
    geoFields: null,
    layoutDirty: true,
    selectedPartitionId: null,
    simulate: false,
    simTimer: null,
    simTick: 0,
    realMessages: 0,
    logItems: []
  };

  AtmoLink.isOnline = function isOnline(key) {
    const sensor = AtmoLink.state.sensors[key];
    return Boolean(sensor && Date.now() - sensor.receivedAt < AtmoLink.config.offlineMs);
  };

  AtmoLink.ageSeconds = function ageSeconds(key) {
    const sensor = AtmoLink.state.sensors[key];
    if (!sensor) return null;
    return Math.max(0, (Date.now() - sensor.receivedAt) / 1000);
  };
})(window);
