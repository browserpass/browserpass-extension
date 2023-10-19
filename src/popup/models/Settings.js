"use strict";

require("chrome-extension-async");

/**
 * Settings Constructor()
 * @since 3.8.0
 *
 * @param {object} settingsObj (optional) Extend an existing
 *      settings object to be backwards and forwards compatible.
 */
function Settings(settingsObj = {}) {
    if (Object.prototype.isPrototypeOf(settingsObj)) {
        // Set object properties
        for (const prop in settingsObj) {
            this[prop] = settingsObj[prop];
        }
    }
}

/**
 * Check if host application can handle DELETE requests.
 *
 * @since 3.8.0
 *
 * @param {object} settingsObj Settings object
 * @returns
 */
Settings.prototype.canDelete = function (settingsObj) {
    return settingsObj.hasOwnProperty("caps") && settingsObj.caps.delete == true;
}

/**
 * Check if host application can handle SAVE requests.
 *
 * @since 3.8.0
 *
 * @param {object} settingsObj Settings object
 * @returns
 */
Settings.prototype.canSave = function (settingsObj) {
    return settingsObj.hasOwnProperty("caps") && settingsObj.caps.save == true;
}

/**
 * Check if host application can handle TREE requests.
 *
 * @since 3.8.0
 *
 * @param {object} settingsObj Settings object
 * @returns
 */
Settings.prototype.canTree = function (settingsObj) {
    return settingsObj.hasOwnProperty("caps") && settingsObj.caps.tree == true;
}

/**
 * Retrieves Browserpass settings or throws an error.
 * Will also cache the first successful response.
 *
 * @since 3.8.0
 *
 * @throws {error} Any error response from the host or browser will be thrown
 * @returns {object} settings
 */
Settings.prototype.get = async function () {
    if (Settings.prototype.isSettings(this.settings)) {
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
    this.settings = new Settings(sets);
    return this.settings;
}

/**
 * Retrieve store object. Can optionally return just the sub path value.
 *
 * @since 3.8.0
 *
 * @param {object} settingsObj Settings object
 * @param {string} property (optional) store sub property path value to return
 * @returns {object} store object or path value
 */
Settings.prototype.getStore = function (settingsObj, property = "") {
    let
        store = (settingsObj.hasOwnProperty("store")) ? settingsObj.store : {},
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
            if (property != "" && store.hasOwnProperty(property)) {
                value = store[property];
            } else {
                value = store;
            }
            break;
    }

    return value;
}

/**
 * Validation, determine if object passed is Settings.
 *
 * @since 3.8.0
 *
 * @param {object} settingsObj
 * @returns
 */
Settings.prototype.isSettings = function (settingsObj) {
    if (typeof settingsObj == 'undefined') {
        return false;
    }

    return Settings.prototype.isPrototypeOf(settingsObj);
}

module.exports = Settings
