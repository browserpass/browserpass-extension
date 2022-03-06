"use strict";

require("chrome-extension-async");

function Settings() {
    // @TODO: perhaps this should be default settings
    this.settings = {}
}

Settings.prototype.canDelete = function (obj) {
    return obj.hasOwnProperty("caps") && obj.caps.delete == true;
}

Settings.prototype.canSave = function (obj) {
    return obj.hasOwnProperty("caps") && obj.caps.save == true;
}

Settings.prototype.get = async function() {
    if (this.isSettings(this.settings)) {
        // console.log("Settings.proto.get(): return this.settings", this.settings);
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
    // console.log("Settings.proto.get(): return response.settings", this.settings);
    return sets
}

Settings.prototype.isSettings = function(obj) {
    return obj.hasOwnProperty("theme");
}

module.exports = Settings
