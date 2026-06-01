(function (window) {
  const AtmoLink = window.AtmoLink;

  AtmoLink.initTemperatureChart = function initTemperatureChart() {
    const { nodes, colors, heights } = AtmoLink.config;
    const { history } = AtmoLink.state;

    AtmoLink.tempChart = new Chart(document.getElementById('tempChart'), {
      type: 'line',
      data: {
        labels: history.labels,
        datasets: nodes.map((key) => ({
          label: `${key} ${heights[key]}m`,
          data: history.temp[key],
          borderColor: colors[key],
          backgroundColor: 'transparent',
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 250 },
        plugins: {
          legend: { labels: { color: '#8b93a3', font: { family: 'DM Mono', size: 11 } } }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 6, color: '#8b93a3', font: { family: 'DM Mono', size: 11 } },
            grid: { color: 'rgba(255,255,255,0.04)' }
          },
          y: {
            ticks: { color: '#8b93a3', font: { family: 'DM Mono', size: 11 }, callback: (value) => value + ' °C' },
            grid: { color: 'rgba(255,255,255,0.04)' }
          }
        }
      }
    });
  };

  AtmoLink.updateTemperatureChart = function updateTemperatureChart() {
    if (AtmoLink.tempChart) AtmoLink.tempChart.update('none');
  };
})(window);
