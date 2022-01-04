"use strict";

require("chrome-extension-async");

var Settings = {
    get: async function() {
        var response = await chrome.runtime.sendMessage({ action: "getSettings" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }
        console.log("Settings.get:", response.settings)
        let settings = response.settings;

        if (settings.hasOwnProperty("hostError")) {
            throw new Error(settings.hostError.params.message);
        }

        if (typeof settings.origin === "undefined") {
            throw new Error("Unable to retrieve current tab information");
        }

        return response.settings;
    }
}

module.exports = Settings
