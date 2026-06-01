# CPS_project_atomlink

AtmoLink is a microclimate demonstration system built with Raspberry Pi Pico W boards and AHT30 temperature/humidity sensors. This version keeps a static single-page entry point for GitHub Pages, splits frontend code into `assets/`, and includes Pico W MicroPython firmware templates.

## Demo Dashboard

Open `index.html` to run the dashboard. The page includes three display modes:

- `Vertical Stratification`: four nodes default to A=0.1 m, B=0.6 m, C=1.1 m, and D=1.7 m. The view shows the vertical air temperature difference from the lowest node, treated as ankle height, to the highest node, treated as head height. It calculates local dissatisfied percentage PD according to ISO 7730:2005 section 6.3. This PD represents the percentage of people predicted to feel discomfort from vertical air temperature difference; it is not the overall PPD derived from PMV.
- `Rack Heatmap`: renders a vertical rack section with four draggable nodes and a user-defined rack unit count. It uses Dijkstra shortest geodesic distance over an 8-connected grid to route around shelves and equipment, then applies inverse distance weighting interpolation with IDW power p = 2. The view can switch between temperature and humidity. Buoyancy diffusion is available only for temperature because it models heat spread; humidity uses standard diffusion.
- `Node Health`: displays node topology, last report age, packet sequence numbers, data freshness, and offline state.

If MQTT is not connected or no real hardware data is received, the page automatically enters simulation mode. The top-right button can also manually start or stop simulation.

## Frontend Structure

The frontend uses `index.html` as the GitHub Pages entry point. It does not require a bundler or build step:

```text
index.html
assets/
  css/
    styles.css
  js/
    config.js
    state.js
    charts.js
    data.js
    app.js
    views/
      sensors.js
      stratification.js
      heatmap.js
      network.js
```

- `assets/css/styles.css`: global layout, cards, tabs, heatmap, and topology styles.
- `assets/js/config.js`: MQTT broker, topics, node heights, colors, coordinates, and fixed settings.
- `assets/js/state.js`: shared frontend state and helpers for online status and data age.
- `assets/js/charts.js`: Chart.js temperature time-series initialization and updates.
- `assets/js/data.js`: MQTT connection, payload normalization, data ingestion, and simulation data.
- `assets/js/app.js`: page initialization, tab switching, and timed redraws.
- `assets/js/views/`: DOM generation and update logic for each view.

## MQTT Topics

The frontend subscribes to these topics:

```text
room/sensor/A
room/sensor/B
room/sensor/C
room/sensor/D
```

The current frontend uses this HiveMQ WebSocket endpoint:

```text
wss://2aff883c85d24676a738e310f0dbc71d.s1.eu.hivemq.cloud:8884/mqtt
```

MQTT usernames and passwords should not be committed to GitHub. The top-right `MQTT Settings` button stores credentials only in the current browser `localStorage`. If credentials are not configured, the dashboard automatically falls back to simulation mode.

## Payload Format

Each Pico W node publishes a fixed JSON payload:

```json
{
  "node_id": "A",
  "temperature": 26.4,
  "humidity": 61.2,
  "timestamp": 1710000000000,
  "seq": 128,
  "battery": 4.8,
  "mode": "wifi"
}
```

Fields:

- `node_id`: node identifier, must be `A`, `B`, `C`, or `D`.
- `temperature`: air temperature in degrees Celsius.
- `humidity`: relative humidity in `%RH`.
- `timestamp`: node-side timestamp in milliseconds.
- `seq`: packet sequence number, used to observe dropped or stalled packets.
- `battery`: battery voltage, can be `null`.
- `mode`: communication mode, currently `wifi` on the main path.

## Pico W Firmware

Firmware templates live in `firmware/`:

- `firmware/aht30.py`: AHT30 I2C reader.
- `firmware/config.example.py`: node configuration template.
- `firmware/main.py`: Wi-Fi, NTP, MQTT reconnect, and publish loop.

Setup:

1. Copy `firmware/config.example.py` to `config.py` on the Pico W.
2. Edit `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_USER`, and `MQTT_PASSWORD`.
3. Set a different `NODE_ID` for each node, for example `A`, `B`, `C`, and `D`.
4. Upload `aht30.py`, `config.py`, and `main.py` to the Pico W.
5. Restart the Pico W and confirm that the frontend receives data.

The default publish interval is once per second:

```python
PUBLISH_INTERVAL_MS = 1000
```

For less stable Wi-Fi environments, change it to 2000.

## Demo Flow

1. Open the web page and confirm that simulation mode runs correctly.
2. Power on the four Pico W nodes and confirm that the four node cards switch from simulation data to live MQTT data.
3. Switch to `Vertical Stratification`, then use a heat source or fan to make the temperature profile diverge or converge.
4. Switch to `Rack Heatmap`, drag nodes and shelves/equipment to match the physical rack, then use a heat source or fan to observe rising heat regions and local hot or humid zones.
5. Switch to `Node Health`, unplug any node, and observe timeout-based offline detection.

## Test Checklist

- Open `index.html` directly; without MQTT, the dashboard should automatically enter simulation mode.
- Manually switch between the three display modes; charts, rack heatmap, and cards should not overlap or overflow.
- When test payloads are published to all four topics, A/B/C/D should update correctly.
- If any node stops for more than 6 seconds, the frontend should show it as offline.
- The dashboard should remain readable on phone widths and projector widths.
