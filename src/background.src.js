//-------------------------------- Background initialisation --------------------------------//
"use strict";

require("chrome-extension-async");

if (typeof browser === "undefined") {
    var browser = chrome;
}

// native application id
var appID = "com.github.browserpass";

// default settings
var defaultSettings = {
    gpgPath: null,
    stores: {}
};

// handle incoming messages
chrome.runtime.onMessage.addListener(receiveMessage);

//----------------------------------- Function definitions ----------------------------------//
/**
 * Get loaded settings
 *
 * @since 3.0.0
 *
 * @return object Loaded settings
 */
function getLocalSettings() {
    var settings = Object.assign({}, defaultSettings);
    settings.defaultStore = {};
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
        var response = await browser.runtime.sendNativeMessage(appID, {
            settings: settings,
            action: "configure"
        });
        console.log("ok", response);
        settings.version = response.version;
        if (settings.stores.length) {
            // there are user-configured stores present
            for (var key in settings.stores) {
                if (response.response.storeSettings.hasOwnProperty(key)) {
                    var storeSettings = settings.stores[key].settings;
                    if (storeSettings) {
                        settings.stores[key].settings = JSON.parse(
                            response.response.storeSettings[key]
                        );
                    }
                }
            }
        } else {
            // no user-configured stores, so use the default store
            settings.defaultStore.name = "default";
            settings.defaultStore.path = response.response.defaultPath;
            settings.defaultStore.settings = response.response.defaultSettings;
            settings.stores.default = settings.defaultStore;
        }
        handleMessage(settings, message, sendResponse);
    } catch (e) {
        // handle error
        console.log(e);
        sendResponse({ status: "error", message: e.toString() });
    }

    // allow async responses after this function returns
    return true;
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
