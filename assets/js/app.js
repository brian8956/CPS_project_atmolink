(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.renderAll = function renderAll() {
    AtmoLink.updateCards();
    AtmoLink.updateStratification();
    AtmoLink.drawHeatmap();
    AtmoLink.updateNetwork();
    document.getElementById('last-update').textContent = 'Last update: ' + new Date().toLocaleTimeString('en-US');
  };

  function bindTabs() {
    document.querySelectorAll('.tab').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((item) => item.classList.remove('active'));
        document.querySelectorAll('.scenario').forEach((section) => section.classList.remove('active'));
        button.classList.add('active');
        document.getElementById(button.dataset.target).classList.add('active');
        AtmoLink.renderAll();
      });
    });
  }

  function bindSimulationToggle() {
    document.getElementById('sim-toggle').addEventListener('click', () => {
      AtmoLink.setSimulation(!AtmoLink.state.simulate);
    });
  }

  function bindMqttSettings() {
    document.getElementById('mqtt-settings').addEventListener('click', () => {
      const credentials = AtmoLink.promptForMqttCredentials();
      if (credentials) window.location.reload();
    });
  }

  function init() {
    AtmoLink.renderSensorCards();
    AtmoLink.renderStratificationView();
    AtmoLink.renderNetworkView();
    AtmoLink.initTemperatureChart();
    bindTabs();
    bindSimulationToggle();
    bindMqttSettings();
    AtmoLink.bindStratificationControls();
    AtmoLink.bindHeatmapControls();
    AtmoLink.renderPartitionLayer();
    AtmoLink.bindPartitionControls();
    AtmoLink.renderLog();
    AtmoLink.renderAll();
    AtmoLink.startMqtt();
    setInterval(AtmoLink.renderAll, 1000);
  }

  init();
})(window);
