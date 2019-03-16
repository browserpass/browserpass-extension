//-------------------------------- Background initialisation --------------------------------//
"use strict";

require("chrome-extension-async");
var sha1 = require("sha1");

// native application id
var appID = "com.github.browserpass.native";

// default settings
var defaultSettings = {
    autoSubmit: false,
    gpgPath: null,
    stores: {},
    foreignFills: {}
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
        delete authListeners[tab.id];
    }
});

// handle incoming messages
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    receiveMessage(message, sender, sendResponse);

    // allow async responses after this function returns
    return true;
});

chrome.runtime.onInstalled.addListener(onExtensionInstalled);

//----------------------------------- Function definitions ----------------------------------//

/**
 * Copy text to clipboard
 *
 * @since 3.0.0
 *
 * @param string text Text to copy
 * @return void
 */
function copyToClipboard(text) {
    document.addEventListener(
        "copy",
        function(e) {
            e.clipboardData.setData("text/plain", text);
            e.preventDefault();
        },
        { once: true }
    );
    document.execCommand("copy");
}

/**
 * Save login to recent list for current domain
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @param string host     Hostname
 * @param object login    Login object
 * @param bool   remove   Remove this item from recent history
 * @return void
 */
function saveRecent(settings, login, remove = false) {
    var ignoreInterval = 60000; // 60 seconds - don't increment counter twice within this window

    // save store timestamp
    localStorage.setItem("recent:" + login.store.id, JSON.stringify(Date.now()));

    // update login usage count & timestamp
    if (Date.now() > login.recent.when + ignoreInterval) {
        login.recent.count++;
    }
    login.recent.when = Date.now();
    settings.recent[sha1(settings.host + sha1(login.store.id + sha1(login.login)))] = login.recent;

    // save to local storage
    localStorage.setItem("recent", JSON.stringify(settings.recent));
}

/**
 * Call injected form-fill code
 *
 * @param object  settings      Settings object
 * @param object  fillRequest   Fill request details
 * @param boolean allFrames     Dispatch to all frames
 * @param boolean allowForeign  Allow foreign-origin iframes
 * @param boolean allowNoSecret Allow forms that don't contain a password field
 * @return array list of filled fields
 */
async function dispatchFill(
    settings,
    fillRequest,
    allFrames = false,
    allowForeign = false,
    allowNoSecret = false
) {
    fillRequest = Object.assign(deepCopy(fillRequest), {
        allowForeign: allowForeign,
        allowNoSecret: allowNoSecret,
        foreignFills: settings.foreignFills[settings.host] || {}
    });

    var perFrameFillResults = await chrome.tabs.executeScript(settings.tab.id, {
        allFrames: allFrames,
        code: `window.browserpass.fillLogin(${JSON.stringify(fillRequest)});`
    });

    // merge filled fields into a single array
    var filledFields = perFrameFillResults
        .reduce((merged, frameResult) => merged.concat(frameResult.filledFields), [])
        .filter((val, i, merged) => merged.indexOf(val) === i);

    // if user answered a foreign-origin confirmation,
    // store the answers in the settings
    var foreignFillsChanged = false;
    for (var frame of perFrameFillResults) {
        if (typeof frame.foreignFill !== "undefined") {
            if (typeof settings.foreignFills[settings.host] === "undefined") {
                settings.foreignFills[settings.host] = {};
            }
            settings.foreignFills[settings.host][frame.foreignOrigin] = frame.foreignFill;
            foreignFillsChanged = true;
        }
    }
    if (foreignFillsChanged) {
        await saveSettings(settings);
    }

    return filledFields;
}

/**
 * Fill form fields
 *
 * @param object settings Settings object
 * @param object login    Login object
 * @param array  fields   List of fields to fill
 * @return array List of filled fields
 */
async function fillFields(settings, login, fields) {
    // check that required fields are present
    for (var field of fields) {
        if (login.fields[field] === null) {
            throw new Error(`Required field is missing: ${field}`);
        }
    }

    // inject script
    await chrome.tabs.executeScript(settings.tab.id, {
        allFrames: true,
        file: "js/inject.dist.js"
    });

    // build fill request
    var fillRequest = {
        origin: new URL(settings.tab.url).origin,
        login: login,
        fields: fields,
        autoSubmit: getSetting("autoSubmit", login, settings)
    };

    // fill form via injected script
    var filledFields = await dispatchFill(settings, fillRequest);

    // try again using same-origin frames if we couldn't fill a password field
    if (!filledFields.includes("secret")) {
        filledFields = filledFields.concat(await dispatchFill(settings, fillRequest, true));
    }

    // try again using all available frames if we couldn't fill a password field
    if (!filledFields.includes("secret") && settings.foreignFills[settings.host] !== false) {
        filledFields = filledFields.concat(await dispatchFill(settings, fillRequest, true, true));
    }

    // try again using same-origin frames, and don't require a password field
    if (!filledFields.length) {
        filledFields = filledFields.concat(
            await dispatchFill(settings, fillRequest, true, false, true)
        );
    }

    // try again using all available frames, and don't require a password field
    if (!filledFields.length && settings.foreignFills[settings.host] !== false) {
        filledFields = filledFields.concat(
            await dispatchFill(settings, fillRequest, true, true, true)
        );
    }

    if (!filledFields.length) {
        throw new Error(`No fillable forms available for fields: ${fields.join(", ")}`);
    }

    return filledFields;
}

/**
 * Get Local settings from the extension
 *
 * @since 3.0.0
 *
 * @return object Local settings from the extension
 */
function getLocalSettings() {
    var settings = deepCopy(defaultSettings);
    for (var key in settings) {
        var value = localStorage.getItem(key);
        if (value !== null) {
            settings[key] = JSON.parse(value);
        }
    }

    return settings;
}

/**
 * Get most relevant setting value
 *
 * @param string key      Setting key
 * @param object login    Login object
 * @param object settings Settings object
 * @return object Setting value
 */
function getSetting(key, login, settings) {
    if (typeof login.settings[key] !== "undefined") {
        return login.settings[key];
    }
    if (typeof settings.stores[login.store.id].settings[key] !== "undefined") {
        return settings.stores[login.store.id].settings[key];
    }

    return settings[key];
}

/**
 * Deep copy an object
 *
 * @since 3.0.0
 *
 * @param object obj an object to copy
 * @return object a new deep copy
 */
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
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
            try {
                await saveSettings(message.settings);
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to save settings" + e.toString()
                });
            }
            break;
        case "listFiles":
            try {
                var response = await hostAction(settings, "list");
                if (response.status != "ok") {
                    throw new Error(JSON.stringify(response)); // TODO handle host error
                }
                sendResponse({ status: "ok", files: response.data.files });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to enumerate password files" + e.toString()
                });
            }
            break;
        case "copyPassword":
            try {
                copyToClipboard(message.login.fields.secret);
                saveRecent(settings, message.login);
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to copy password"
                });
            }
            break;
        case "copyUsername":
            try {
                copyToClipboard(message.login.fields.login);
                saveRecent(settings, message.login);
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to copy username"
                });
            }
            break;

        case "launch":
            try {
                var url = message.login.fields.url || message.login.domain;
                if (!url) {
                    throw new Error("No URL is defined for this entry");
                }
                if (!url.match(/:\/\//)) {
                    url = "http://" + url;
                }
                if (authListeners[settings.tab.id]) {
                    chrome.tabs.onUpdated.removeListener(authListeners[settings.tab.id]);
                    delete authListeners[settings.tab.id];
                }
                authListeners[settings.tab.id] = handleModalAuth.bind({
                    url: url,
                    login: message.login
                });
                chrome.webRequest.onAuthRequired.addListener(
                    authListeners[settings.tab.id],
                    { urls: ["*://*/*"], tabId: settings.tab.id },
                    ["blocking"]
                );
                chrome.tabs.update(settings.tab.id, { url: url });
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
                // dispatch initial fill request
                var filledFields = await fillFields(settings, message.login, ["login", "secret"]);
                saveRecent(settings, message.login);

                // no need to check filledFields, because fillFields() already throws an error if empty
                sendResponse({ status: "ok", filledFields: filledFields });
            } catch (e) {
                try {
                    sendResponse({
                        status: "error",
                        message: e.toString()
                    });
                } catch (e) {
                    // TODO An error here is typically a closed message port, due to a popup taking focus
                    // away from the extension menu and the menu closing as a result. Need to investigate
                    // whether triggering the extension menu from the background script is possible.
                    console.log(e);
                }
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
        storeId: login.store.id,
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
    login.settings = {
        autoSubmit: { name: "autosubmit", type: "bool" }
    };
    var lines = login.raw.split(/[\r\n]+/).filter(line => line.trim().length > 0);
    lines.forEach(function(line) {
        // split key / value
        var parts = line
            .split(":")
            .map(value => value.trim())
            .filter(value => value.length);
        if (parts.length != 2) {
            return;
        }

        // assign to fields
        for (var key in login.fields) {
            if (
                Array.isArray(login.fields[key]) &&
                login.fields[key].indexOf(parts[0].toLowerCase()) >= 0
            ) {
                login.fields[key] = parts[1];
                break;
            }
        }

        // assign to settings
        for (var key in login.settings) {
            if (
                typeof login.settings[key].type !== "undefined" &&
                login.settings[key].name.indexOf(parts[0].toLowerCase()) >= 0
            ) {
                if (login.settings[key].type === "bool") {
                    login.settings[key] = ["true", "yes"].includes(parts[1].toLowerCase());
                } else {
                    login.settings[key] = parts[1];
                }

                break;
            }
        }
    });

    // clean up unassigned fields
    for (var key in login.fields) {
        if (Array.isArray(login.fields[key])) {
            if (key == "secret" && lines.length) {
                login.fields.secret = lines[0];
            } else if (key == "login") {
                login.fields[key] = login.login.match(/([^\/]+)$/)[1];
            } else {
                delete login.fields[key];
            }
        }
    }
    for (var key in login.settings) {
        if (typeof login.settings[key].type !== "undefined") {
            delete login.settings[key];
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
        var configureSettings = Object.assign(deepCopy(settings), {
            defaultStore: {}
        });
        var response = await hostAction(configureSettings, "configure");
        if (response.status != "ok") {
            throw new Error(JSON.stringify(response)); // TODO handle host error
        }
        settings.version = response.version;
        if (Object.keys(settings.stores).length > 0) {
            // there are user-configured stores present
            for (var storeId in settings.stores) {
                if (response.data.storeSettings.hasOwnProperty(storeId)) {
                    var fileSettings = JSON.parse(response.data.storeSettings[storeId]);
                    if (typeof settings.stores[storeId].settings !== "object") {
                        settings.stores[storeId].settings = {};
                    }
                    var storeSettings = settings.stores[storeId].settings;
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
                id: "default",
                name: "pass",
                path: response.data.defaultStore.path
            };
            var fileSettings = JSON.parse(response.data.defaultStore.settings);
            if (typeof settings.stores.default.settings !== "object") {
                settings.stores.default.settings = {};
            }
            var storeSettings = settings.stores.default.settings;
            for (var settingKey in fileSettings) {
                if (!storeSettings.hasOwnProperty(settingKey)) {
                    storeSettings[settingKey] = fileSettings[settingKey];
                }
            }
        }

        // Fill recent data
        for (var storeId in settings.stores) {
            var when = localStorage.getItem("recent:" + storeId);
            if (when) {
                settings.stores[storeId].when = JSON.parse(when);
            } else {
                settings.stores[storeId].when = 0;
            }
        }
        settings.recent = localStorage.getItem("recent");
        if (settings.recent) {
            settings.recent = JSON.parse(settings.recent);
        } else {
            settings.recent = {};
        }

        // Fill current tab info
        try {
            settings.tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
            settings.host = new URL(settings.tab.url).hostname;
        } catch (e) {}

        handleMessage(settings, message, sendResponse);
    } catch (e) {
        // handle error
        console.log(e);
        sendResponse({ status: "error", message: e.toString() });
    }
}

/**
 * Save settings if they are valid
 *
 * @since 3.0.0
 *
 * @param object Final settings object
 * @return void
 */
async function saveSettings(settings) {
    // 'default' is our reserved name for the default store
    delete settings.stores.default;

    var response = await hostAction(settings, "configure");
    if (response.status != "ok") {
        throw new Error(JSON.stringify(response)); // TODO handle host error
    }

    for (var key in defaultSettings) {
        if (settings.hasOwnProperty(key)) {
            localStorage.setItem(key, JSON.stringify(settings[key]));
        }
    }
}

/**
 * Handle browser extension installation and updates
 *
 * @since 3.0.0
 *
 * @param object Event details
 * @return void
 */
function onExtensionInstalled(details) {
    // No permissions
    if (!chrome.notifications) {
        return;
    }

    var show = (id, title, message) => {
        chrome.notifications.create(id, {
            title: title,
            message: message,
            iconUrl: "icon-lock.png",
            type: "basic"
        });
    };

    if (details.reason == "install") {
        show(
            "installed",
            "browserpass: Install native host app",
            "Remember to install the complementary native host app to use this extension.\n" +
                "Instructions here: https://github.com/browserpass/browserpass-native"
        );
    } else if (details.reason == "update") {
        var changelog = {
            3000000:
                "New major update is out, please update the native host app to v3.\n" +
                "Instructions here: https://github.com/browserpass/browserpass-native"
        };

        var parseVersion = version => {
            var [major, minor, patch] = version.split(".");
            return parseInt(major) * 1000000 + parseInt(minor) * 1000 + parseInt(patch);
        };
        var newVersion = parseVersion(chrome.runtime.getManifest().version);
        var prevVersion = parseVersion(details.previousVersion);

        Object.keys(changelog)
            .sort()
            .forEach(function(version) {
                if (prevVersion < version && newVersion >= version) {
                    show(version.toString(), "browserpass: Important changes", changelog[version]);
                }
            });
    }
}
