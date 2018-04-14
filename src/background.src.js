//-------------------------------- Background initialisation --------------------------------//
"use strict";

require("chrome-extension-async");

if (typeof browser === "undefined") {
    var browser = chrome;
}

// native application id
var appID = "com.github.browserpass.native";

// default settings
var defaultSettings = {
    gpgPath: null,
    stores: {}
};

// handle incoming messages
browser.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    receiveMessage(message, sender, sendResponse);

    // allow async responses after this function returns
    return true;
});

//----------------------------------- Function definitions ----------------------------------//
/**
 * Get Local settings from the extension
 *
 * @since 3.0.0
 *
 * @return object Local settings from the extension
 */
function getLocalSettings() {
    var settings = Object.assign({}, defaultSettings);
    for (var key in settings) {
        var value = localStorage.getItem(key);
        if (value !== null) {
            settings[key] = JSON.parse(value);
        }
    }

    return settings;
}

/**
 * Handle a message from elsewhere within the extension
 *
 * @since 3.0.0
 *
 * @param object          settings     Settings object
 * @param mixed           message      Incoming message
 * @param function(mixed) sendResponse Callback to send response
 * @return void
 */
function handleMessage(settings, message, sendResponse) {
    // check that action is present
    if (typeof message !== "object" || !message.hasOwnProperty("action")) {
        sendResponse({ status: "error", message: "Action is missing" });
    }

    switch (message.action) {
        case "getSettings":
            sendResponse({
                status: "ok",
                settings: settings
            });
            break;
        case "saveSettings":
            saveSettings(message.settings);
            sendResponse({ status: "ok" });
            break;
        default:
            sendResponse({
                status: "error",
                message: "Unknown action: " + message.action
            });
            break;
    }
}

/**
 * Wrap inbound messages to fetch native configuration
 *
 * @since 3.0.0
 *
 * @param mixed            message      Incoming message
 * @param MessageSender    sender       Message sender
 * @param function(mixed)  sendResponse Callback to send response
 * @return void
 */
async function receiveMessage(message, sender, sendResponse) {
    // restrict messages to this extension only
    if (sender.id !== browser.runtime.id) {
        // silently exit without responding when the source is foreign
        return;
    }

    var settings = getLocalSettings();
    try {
        var configureSettings = Object.assign(settings, { defaultStore: {} });
        var response = await browser.runtime.sendNativeMessage(appID, {
            settings: configureSettings,
            action: "configure"
        });
        settings.version = response.version;
        if (settings.stores.length) {
            // there are user-configured stores present
            for (var key in settings.stores) {
                if (response.data.storeSettings.hasOwnProperty(key)) {
                    var fileSettings = JSON.parse(response.data.storeSettings[key]);
                    if (typeof settings.stores[key].settings !== "object") {
                        settings.stores[key].settings = {};
                    }
                    var storeSettings = settings.stores[key].settings;
                    for (var settingKey in fileSettings) {
                        if (!storeSettings.hasOwnProperty(settingKey)) {
                            storeSettings[settingKey] = fileSettings[settingKey];
                        }
                    }
                }
            }
        } else {
            // no user-configured stores, so use the default store
            settings.stores.default = {
                name: "default",
                path: response.data.defaultPath,
                settings: response.data.defaultSettings
            };
        }
        handleMessage(settings, message, sendResponse);
    } catch (e) {
        // handle error
        console.log(e);
        sendResponse({ status: "error", message: e.toString() });
    }
}

/**
 * Save settings
 *
 * @since 3.0.0
 *
 * @param object Final settings object
 * @return void
 */
function saveSettings(settings) {
    for (var key in defaultSettings) {
        if (settings.hasOwnProperty(key)) {
            localStorage.setItem(key, JSON.stringify(settings[key]));
        }
    }
}
