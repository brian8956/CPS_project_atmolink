import time


class AHT30:
    ADDRESS = 0x38

    def __init__(self, i2c, address=ADDRESS):
        self.i2c = i2c
        self.address = address
        self._init_sensor()

    def _init_sensor(self):
        self.i2c.writeto(self.address, b"\xBE\x08\x00")
        time.sleep_ms(20)

    def read(self):
        self.i2c.writeto(self.address, b"\xAC\x33\x00")
        time.sleep_ms(80)
        data = self.i2c.readfrom(self.address, 6)
        if data[0] & 0x80:
            raise RuntimeError("AHT30 busy")

        raw_humidity = ((data[1] << 12) | (data[2] << 4) | (data[3] >> 4))
        raw_temperature = (((data[3] & 0x0F) << 16) | (data[4] << 8) | data[5])

        humidity = raw_humidity * 100 / 1048576
        temperature = raw_temperature * 200 / 1048576 - 50
        return temperature, humidity
