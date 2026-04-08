from homeassistant import config_entries
from .const import DOMAIN

class SmartEnergyConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None):
        '''Will be called when the user starts the configuration flow.'''
        if user_input is not None:
            return self.async_create_entry(title="My hello world device", data=user_input)

        return self.async_show_form(step_id="user")