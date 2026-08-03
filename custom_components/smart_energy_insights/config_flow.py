import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from .const import DOMAIN

class SmartEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="Smart Energy Insights", data=user_input)

        return self.async_show_form(step_id="user", data_schema=vol.Schema({}))

    @staticmethod
    @callback
    def async_get_options_flow(config_entry):
        return SmartEnergyOptionsFlow(config_entry)


class SmartEnergyOptionsFlow(config_entries.OptionsFlow):
    def __init__(self, config_entry):
        self._config_entry = config_entry

    async def async_step_init(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = self._config_entry.options
        data = self._config_entry.data

        current_fixed = options.get("fixed_price", data.get("fixed_price", 15.0))
        current_fixed_base = options.get("fixed_base_fee", data.get("fixed_base_fee", 4.90))
        current_markup = options.get("spot_markup", data.get("spot_markup", 1.5))
        current_spot_base = options.get("spot_base_fee", data.get("spot_base_fee", 5.99))
        current_tax = options.get("tax_rate", data.get("tax_rate", 20.0))

        data_schema = vol.Schema({
            vol.Required("fixed_price", default=current_fixed): vol.Coerce(float),
            vol.Required("fixed_base_fee", default=current_fixed_base): vol.Coerce(float),
            vol.Required("spot_markup", default=current_markup): vol.Coerce(float),
            vol.Required("spot_base_fee", default=current_spot_base): vol.Coerce(float),
            vol.Required("tax_rate", default=current_tax): vol.Coerce(float),
        })

        return self.async_show_form(step_id="init", data_schema=data_schema)