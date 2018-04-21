//-------------------------------- Background initialisation --------------------------------//
"use strict";

require("chrome-extension-async");

// native application id
var appID = "com.github.browserpass.native";

// default settings
var defaultSettings = {
    gpgPath: null,
    stores: {}
};

var authListeners = {};

// watch for tab updates
chrome.tabs.onUpdated.addListener(function(tab, info) {
    // ignore non-complete status
    if (info.status !== "complete") {
        return;
    }

    // unregister any auth listeners for this tab
    if (authListeners[tab.id]) {
        chrome.tabs.onAuthRequired.removeListener(authListeners[tab.id]);
        authListeners[tab.id] = null;
    }
});

// handle incoming messages
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
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
 * Handle modal authentication requests (e.g. HTTP basic)
 *
 * @since 3.0.0
 *
 * @param object requestDetails Auth request details
 * @return object Authentication credentials or {}
 */
function handleModalAuth(requestDetails) {
    var launchHost = requestDetails.url.match(/:\/\/([^\/]+)/)[1];

    // don't attempt authentication against the same login more than once
    if (!this.login.allowFill) {
        return {};
    }
    this.login.allowFill = false;

    // don't attempt authentication outside the main frame
    if (requestDetails.type !== "main_frame") {
        return {};
    }

    // ensure the auth domain is the same, or ask the user for permissions to continue
    if (launchHost !== requestDetails.challenger.host) {
        var message =
            "You are about to send login credentials to a domain that is different than " +
            "the one you lauched from the browserpass extension. Do you wish to proceed?\n\n" +
            "Realm: " +
            requestDetails.realm +
            "\n" +
            "Launched URL: " +
            this.url +
            "\n" +
            "Authentication URL: " +
            requestDetails.url;
        if (!confirm(message)) {
            return {};
        }
    }

    // ask the user before sending credentials over an insecure connection
    if (!requestDetails.url.match(/^https:/i)) {
        var message =
            "You are about to send login credentials via an insecure connection!\n\n" +
            "Are you sure you want to do this? If there is an attacker watching your " +
            "network traffic, they may be able to see your username and password.\n\n" +
            "URL: " +
            requestDetails.url;
        if (!confirm(message)) {
            return {};
        }
    }

    // supply credentials
    return {
        authCredentials: {
            username: this.login.fields.login,
            password: this.login.fields.secret
        }
    };
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
async function handleMessage(settings, message, sendResponse) {
    // check that action is present
    if (typeof message !== "object" || !message.hasOwnProperty("action")) {
        sendResponse({ status: "error", message: "Action is missing" });
    }

    // fetch file & parse fields if a login entry is present
    if (typeof message.login !== "undefined") {
        await parseFields(settings, message.login);
    }

    // route action
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
        case "listFiles":
            try {
                var response = await hostAction(settings, "list");
                sendResponse(response.data.files);
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to enumerate password files" + e.toString()
                });
            }
            break;
        case "launch":
            try {
                var tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                var url = message.login.fields.url ? message.login.fields.url : response.login.url;
                if (!url.match(/:\/\//)) {
                    url = "http://" + url;
                }
                if (authListeners[tab.id]) {
                    chrome.tabs.onUpdated.removeListener(authListeners[tab.id]);
                    authListeners[tab.id] = null;
                }
                authListeners[tab.id] = handleModalAuth.bind({ url: url, login: message.login });
                chrome.webRequest.onAuthRequired.addListener(
                    authListeners[tab.id],
                    { urls: ["*://*/*"], tabId: tab.id },
                    ["blocking"]
                );
                chrome.tabs.update(tab.id, { url: url });
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to launch URL: " + e.toString()
                });
            }
            break;
        case "fill":
            try {
                var tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                await chrome.tabs.executeScript(tab.id, { file: "js/inject.dist.js" });
                // check login fields
                if (message.login.fields.login === null) {
                    throw new Error("No login is available");
                }
                if (message.login.fields.secret === null) {
                    throw new Error("No password is available");
                }
                var fillFields = JSON.stringify({
                    login: message.login.fields.login,
                    secret: message.login.fields.secret
                });
                // fill form via injected script
                await chrome.tabs.executeScript(tab.id, {
                    code: `window.browserpass.fillLogin(${fillFields});`
                });
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to fill credentials: " + e.toString()
                });
            }
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
 * Send a request to the host app
 *
 * @since 3.0.0
 *
 * @param object settings Live settings object
 * @param string action   Action to run
 * @param params object   Additional params to pass to the host app
 * @return Promise
 */
function hostAction(settings, action, params = {}) {
    var request = {
        settings: settings,
        action: action
    };
    for (var key in params) {
        request[key] = params[key];
    }

    return chrome.runtime.sendNativeMessage(appID, request);
}

/**
 * Fetch file & parse fields
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @param object login    Login object
 * @return void
 */
async function parseFields(settings, login) {
    var response = await hostAction(settings, "fetch", {
        store: login.store,
        file: login.login + ".gpg"
    });
    if (response.status != "ok") {
        throw new Error(JSON.stringify(response)); // TODO handle host error
    }

    // save raw data inside login
    login.raw = response.data.contents;

    // parse lines
    login.fields = {
        secret: ["secret", "password", "pass"],
        login: ["login", "username", "user", "email"],
        url: ["url", "uri", "website", "site", "link", "launch"]
    };
    var lines = login.raw.split(/[\r\n]+/).filter(line => line.trim().length > 0);
    lines.forEach(function(line) {
        // split key / value
        var parts = line
            .split(":", 2)
            .map(value => value.trim())
            .filter(value => value.length);
        if (parts.length != 2) {
            return;
        }

        // assign to fields
        for (var key in login.fields) {
            if (Array.isArray(login.fields[key]) && login.fields[key].indexOf(parts[0]) >= 0) {
                login.fields[key] = parts[1];
                break;
            }
        }
    });

    // clean up unassigned fields
    for (var key in login.fields) {
        if (Array.isArray(login.fields[key])) {
            if (key == "secret" && lines.length) {
                login.fields.secret = lines[0];
            } else {
                login.fields[key] = null;
            }
        }
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
    if (sender.id !== chrome.runtime.id) {
        // silently exit without responding when the source is foreign
        return;
    }

    var settings = getLocalSettings();
    try {
        var configureSettings = Object.assign(settings, { defaultStore: {} });
        var response = await chrome.runtime.sendNativeMessage(appID, {
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
                path: response.data.defaultStore.path,
                settings: response.data.defaultStore.settings
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
