# CPS_project_atomlink

AtmoLink 是一個以 Raspberry Pi Pico W 與 AHT30 溫濕度感測器為核心的微氣候展示系統。此版本維持 GitHub Pages 可直接部署的靜態單頁入口，同時將前端樣式與功能拆分到 `assets/`，並提供 Pico W MicroPython 韌體範本。

## Demo Dashboard

開啟 `index.html` 即可使用。頁面包含三個展示模式：

- `垂直熱分層`：四個節點對應 0.1m、0.6m、1.1m、1.7m，顯示頭腳溫差、垂直梯度與簡化 PPD 狀態。
- `2D 微氣候熱力圖`：四個角落節點以 Dijkstra（8 連通）計算繞過隔板的最短測地線距離，再做反距離權重內插（IDW, p = 2）。可切換溫度/濕度；門扉開關會即時改變視距路徑，關門時熱力邊界停在門前。可用 `+ 隔板`、`+ 門`、拖曳、右下角縮放與 `✕` 自由調整機箱內部格局。
- `容錯網路`：顯示節點拓撲、最後回報時間、封包序號、資料新鮮度與失聯狀態。

如果 MQTT 沒有連線或沒有收到真實硬體資料，頁面會自動啟用模擬模式。也可以用右上角按鈕手動啟用或停止模擬。

## Frontend Structure

前端仍以 `index.html` 作為 GitHub Pages 的入口頁，但功能已拆到多個靜態檔案，不需要 bundler 或建置步驟：

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

- `assets/css/styles.css`：全站版面、卡片、分頁、熱力圖、拓撲圖樣式。
- `assets/js/config.js`：MQTT broker、topic、節點高度、顏色、座標等固定設定。
- `assets/js/state.js`：前端共用狀態與節點在線/資料年齡 helper。
- `assets/js/charts.js`：Chart.js 溫度時間序列初始化與更新。
- `assets/js/data.js`：MQTT 連線、payload 正規化、資料寫入、模擬資料。
- `assets/js/app.js`：頁面初始化、分頁切換、定時重繪。
- `assets/js/views/`：各展示區塊的 DOM 產生與更新邏輯。

## MQTT Topics

前端訂閱以下 topic：

```text
room/sensor/A
room/sensor/B
room/sensor/C
room/sensor/D
```

目前前端使用 HiveMQ WebSocket：

```text
wss://2aff883c85d24676a738e310f0dbc71d.s1.eu.hivemq.cloud:8884/mqtt
```

MQTT 使用者名稱與密碼不應提交到 GitHub。前端右上角提供 `設定 MQTT` 按鈕，登入資訊只會存在目前瀏覽器的 `localStorage`。未設定時，展示頁會自動改用模擬資料。

## Payload Format

每個 Pico W 節點發送固定 JSON 格式：

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

欄位說明：

- `node_id`：節點代號，必須是 `A`、`B`、`C`、`D`。
- `temperature`：攝氏溫度。
- `humidity`：相對濕度，單位 `%RH`。
- `timestamp`：節點端時間戳，毫秒。
- `seq`：封包序號，用於觀察是否掉包或停送。
- `battery`：電池電壓，可先填 `null`。
- `mode`：通訊模式，目前主線使用 `wifi`。

## Pico W Firmware

韌體範本位於 `firmware/`：

- `firmware/aht30.py`：AHT30 I2C 讀取驅動。
- `firmware/config.example.py`：節點設定範本。
- `firmware/main.py`：Wi-Fi、NTP、MQTT reconnect 與資料發送主迴圈。

設定步驟：

1. 將 `firmware/config.example.py` 複製成 Pico W 上的 `config.py`。
2. 修改 `WIFI_SSID`、`WIFI_PASSWORD`、`MQTT_USER`、`MQTT_PASSWORD`。
3. 每個節點設定不同的 `NODE_ID`，例如 `A`、`B`、`C`、`D`。
4. 將 `aht30.py`、`config.py`、`main.py` 上傳到 Pico W。
5. 重新啟動 Pico W，確認前端 dashboard 收到資料。

預設發送頻率是 1 秒一次：

```python
PUBLISH_INTERVAL_MS = 1000
```

展示現場如果 Wi-Fi 較不穩，可以改成 2000。

## 展示流程建議

1. 先開啟網頁並確認模擬模式可以正常跑。
2. 接上四個 Pico W，確認四張節點卡會從模擬資料切換成 MQTT 即時資料。
3. 切到 `垂直熱分層`，用熱源或風扇製造溫度曲線發散/收斂。
4. 切到 `2D 微氣候熱力圖`，用熱水或加濕器製造局部高溫/高濕區。
5. 切到 `容錯網路`，拔掉任一節點電源，觀察節點逾時變灰與容錯狀態。

## Test Checklist

- 直接開啟 `index.html`，無 MQTT 時應自動進入模擬模式。
- 手動切換三個展示模式，圖表與卡片不應重疊或溢出。
- 四個 topic 發送測試資料時，A/B/C/D 應正確更新。
- 停止任一節點超過 6 秒，前端應顯示 offline。
- 手機寬度與投影螢幕寬度都應可讀。
