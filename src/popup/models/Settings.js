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

/**
 * Retreive store object. Can optionally return just the sub path value.
 *
 * @since 3.X.Y
 *
 * @param {object} obj Login object
 * @param {string} property (optional) store sub property path value to return
 */
Settings.prototype.getStore = function(obj, property = "") {
    let
        store = (obj.hasOwnProperty("store")) ? obj.store : {},
        value = null
    ;

    switch (property) {
        case "color":
        case "bgColor":
            if (store.hasOwnProperty(property)) {
                value = store[property];
            }
            break;

        default:
            break;
    }

    return value;
}

Settings.prototype.isSettings = function(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    return obj.hasOwnProperty("theme");
}

module.exports = Settings
