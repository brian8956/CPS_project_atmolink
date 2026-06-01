import json
import machine
import network
import ntptime
import time
import ubinascii
from umqtt.simple import MQTTClient

from aht30 import AHT30
import config


TOPIC = "room/sensor/{}/".format(config.NODE_ID).rstrip("/")
CLIENT_ID = "atmolink-{}-{}".format(
    config.NODE_ID,
    ubinascii.hexlify(machine.unique_id()).decode()
)


def ticks_ms():
    return time.ticks_ms()


def epoch_ms():
    return time.time() * 1000


def connect_wifi():
    wlan = network.WLAN(network.STA_IF)
    wlan.active(True)
    if not wlan.isconnected():
        wlan.connect(config.WIFI_SSID, config.WIFI_PASSWORD)
        start = ticks_ms()
        while not wlan.isconnected():
            if time.ticks_diff(ticks_ms(), start) > 15000:
                raise RuntimeError("Wi-Fi connection timeout")
            time.sleep_ms(250)
    return wlan


def sync_time():
    for _ in range(3):
        try:
            ntptime.settime()
            return True
        except Exception:
            time.sleep(1)
    return False


def connect_mqtt():
    client = MQTTClient(
        CLIENT_ID,
        config.MQTT_BROKER,
        port=config.MQTT_PORT,
        user=config.MQTT_USER,
        password=config.MQTT_PASSWORD,
        ssl=True,
        keepalive=30,
    )
    client.connect()
    return client


def make_payload(node_id, temperature, humidity, seq):
    return {
        "node_id": node_id,
        "temperature": round(temperature, 2),
        "humidity": round(humidity, 2),
        "timestamp": epoch_ms(),
        "seq": seq,
        "battery": None,
        "mode": "wifi",
    }


def main():
    i2c = machine.I2C(
        0,
        sda=machine.Pin(config.I2C_SDA_PIN),
        scl=machine.Pin(config.I2C_SCL_PIN),
        freq=config.I2C_FREQ,
    )
    sensor = AHT30(i2c)
    wlan = None
    client = None
    seq = 0

    while True:
        try:
            if wlan is None or not wlan.isconnected():
                wlan = connect_wifi()
                sync_time()
            if client is None:
                client = connect_mqtt()

            temperature, humidity = sensor.read()
            payload = make_payload(config.NODE_ID, temperature, humidity, seq)
            client.publish(TOPIC, json.dumps(payload))
            seq += 1
            time.sleep_ms(config.PUBLISH_INTERVAL_MS)

        except Exception as exc:
            print("recovering:", exc)
            try:
                if client is not None:
                    client.disconnect()
            except Exception:
                pass
            client = None
            time.sleep(2)


main()
