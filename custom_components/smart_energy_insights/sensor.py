from homeassistant.components.sensor import SensorEntity

async def async_setup_entry(hass, entry, async_add_entities):
    """Add entities for the config entry."""
    # We pass the 'entry' object to the sensor
    async_add_entities([HelloWorldSensor(entry)])

class HelloWorldSensor(SensorEntity):
    def __init__(self, entry):
        """Initializes the sensor."""
        self._entry = entry
        # Dynamic ID: Combines the instance ID with the sensor name to ensure uniqueness when multiple instances are added
        self._attr_unique_id = f"{entry.entry_id}_hello_world"
        self._attr_name = "Smart Energy Status"

    @property
    def state(self):
        return "Hello World"