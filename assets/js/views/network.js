(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.renderNetworkView = function renderNetworkView() {
    const { nodes, colors } = AtmoLink.config;
    document.getElementById('topology').innerHTML = nodes.map((key) => `
      <div class="network-node node-${key}" id="net-${key}">
        <b style="color:${colors[key]}">${key}</b>
        <span id="net-age-${key}">offline</span>
        <span id="net-seq-${key}">seq --</span>
      </div>
    `).join('');
  };

  AtmoLink.updateNetwork = function updateNetwork() {
    const { nodes } = AtmoLink.config;
    const { sensors } = AtmoLink.state;
    const onlineKeys = nodes.filter(AtmoLink.isOnline);

    nodes.forEach((key) => {
      const node = document.getElementById(`net-${key}`);
      const online = AtmoLink.isOnline(key);
      const age = AtmoLink.ageSeconds(key);
      node.classList.toggle('offline', !online);
      document.getElementById(`net-age-${key}`).textContent = online ? `${age.toFixed(1)}s fresh` : 'offline';
      document.getElementById(`net-seq-${key}`).textContent = `seq ${sensors[key]?.seq || '--'}`;
    });

    document.getElementById('online-count').textContent = `${onlineKeys.length} / 4`;
    const ages = onlineKeys.map(AtmoLink.ageSeconds);
    document.getElementById('avg-age').textContent = ages.length ? `${(ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1)} s` : '-- s';

    const fault = document.getElementById('fault-state');
    if (onlineKeys.length === 4) fault.textContent = '全節點正常';
    else if (onlineKeys.length >= 2) fault.textContent = '容錯運作中';
    else if (onlineKeys.length === 1) fault.textContent = '僅 AP/單節點';
    else fault.textContent = '等待資料';

    AtmoLink.renderLog();
  };

  AtmoLink.addLog = function addLog(source, message) {
    const text = `${new Date().toLocaleTimeString('zh-TW')} [${source}] ${message}`;
    AtmoLink.state.logItems.unshift(text);
    AtmoLink.state.logItems = AtmoLink.state.logItems.slice(0, 12);
    AtmoLink.renderLog();
  };

  AtmoLink.renderLog = function renderLog() {
    const root = document.getElementById('event-log');
    root.innerHTML = AtmoLink.state.logItems.length
      ? AtmoLink.state.logItems.map((item) => `<div>${item}</div>`).join('')
      : '<div>等待 MQTT 或模擬事件。</div>';
  };
})(window);
