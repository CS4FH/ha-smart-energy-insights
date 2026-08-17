import voluptuous as vol
from homeassistant import config_entries
from homeassistant.core import callback
from .const import DOMAIN


DEFAULT_PRICING_VALUES = {
    "fixed_price": 15.0,
    "fixed_base_fee": 5.0,
    "spot_markup": 1.5,
    "spot_base_fee": 2.5,
    "tax_rate": 20.0,
}


def _build_pricing_schema(*, defaults: dict | None = None) -> vol.Schema:
    """Build pricing schema for config and options flows."""
    defaults = defaults or {}
    return vol.Schema(
        {
            vol.Required("fixed_price", default=defaults.get("fixed_price", vol.UNDEFINED)): vol.Coerce(float),
            vol.Required("fixed_base_fee", default=defaults.get("fixed_base_fee", vol.UNDEFINED)): vol.Coerce(float),
            vol.Required("spot_markup", default=defaults.get("spot_markup", vol.UNDEFINED)): vol.Coerce(float),
            vol.Required("spot_base_fee", default=defaults.get("spot_base_fee", vol.UNDEFINED)): vol.Coerce(float),
            vol.Required("tax_rate", default=defaults.get("tax_rate", vol.UNDEFINED)): vol.Coerce(float),
        }
    )

class SmartEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        if user_input is not None:
            return self.async_create_entry(title="Smart Energy Insights", data=user_input)

        return self.async_show_form(
            step_id="user", data_schema=_build_pricing_schema(defaults=DEFAULT_PRICING_VALUES)
        )

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

        current_fixed = options.get("fixed_price", data.get("fixed_price", DEFAULT_PRICING_VALUES["fixed_price"]))
        current_fixed_base = options.get(
            "fixed_base_fee", data.get("fixed_base_fee", DEFAULT_PRICING_VALUES["fixed_base_fee"])
        )
        current_markup = options.get("spot_markup", data.get("spot_markup", DEFAULT_PRICING_VALUES["spot_markup"]))
        current_spot_base = options.get(
            "spot_base_fee", data.get("spot_base_fee", DEFAULT_PRICING_VALUES["spot_base_fee"])
        )
        current_tax = options.get("tax_rate", data.get("tax_rate", DEFAULT_PRICING_VALUES["tax_rate"]))

        data_schema = _build_pricing_schema(
            defaults={
                "fixed_price": current_fixed,
                "fixed_base_fee": current_fixed_base,
                "spot_markup": current_markup,
                "spot_base_fee": current_spot_base,
                "tax_rate": current_tax,
            }
        )

        return self.async_show_form(step_id="init", data_schema=data_schema)