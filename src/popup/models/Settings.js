"use strict";

require("chrome-extension-async");

function Settings() {
    this.settings = {}
}

Settings.prototype.get = async function() {
    if (this.isSettings(this.settings)) {
        return this.settings
    }

    var response = await chrome.runtime.sendMessage({ action: "getSettings" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    // save response to tmp settings variable, sets
    let sets = response.settings;

    if (sets.hasOwnProperty("hostError")) {
        throw new Error(sets.hostError.params.message);
    }

    if (typeof sets.origin === "undefined") {
        throw new Error("Unable to retrieve current tab information");
    }

    // cache response.settings for future requests
    this.settings = sets
    return sets
}

Settings.prototype.isSettings = function(obj) {
    return obj.hasOwnProperty("theme");
}

module.exports = Settings
