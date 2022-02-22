"use strict";

require("chrome-extension-async");

function Settings() {
    this.sets = {}
}

Settings.prototype.get = async function() {
    if (this.sets.hasOwnProperty("theme")) {
        // console.log("Settings.get(): return this.sets", this.sets)
        return this.sets
    }

    var response = await chrome.runtime.sendMessage({ action: "getSettings" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }
    let _sets = response.settings;

    if (_sets.hasOwnProperty("hostError")) {
        throw new Error(_sets.hostError.params.message);
    }

    if (typeof _sets.origin === "undefined") {
        throw new Error("Unable to retrieve current tab information");
    }

    this.sets = _sets
    // console.log("Settings.get(): return response.settings", _sets)
    return _sets
}

module.exports = Settings
