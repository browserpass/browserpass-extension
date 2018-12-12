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
 * Call injected form-fill code
 *
 * @param object  tab           Target tab
 * @param object  fillRequest   Fill request details
 * @param boolean allFrames     Dispatch to all frames
 * @param boolean allowForeign  Allow foreign-origin iframes
 * @param boolean allowNoSecret Allow forms that don't contain a password field
 * @return array list of filled fields
 */
async function dispatchFill(
    tab,
    fillRequest,
    allFrames = false,
    allowForeign = false,
    allowNoSecret = false
) {
    fillRequest = Object.assign({}, fillRequest, {
        allowForeign: allowForeign,
        allowNoSecret: allowNoSecret
    });

    var filledFields = await chrome.tabs.executeScript(tab.id, {
        allFrames: allFrames,
        code: `window.browserpass.fillLogin(${JSON.stringify(fillRequest)});`
    });

    // simplify the list of filled fields
    filledFields = filledFields
        .reduce((fields, addFields) => fields.concat(addFields), [])
        .reduce(function(fields, field) {
            if (!fields.includes(field)) {
                fields.push(field);
            }
            return fields;
        }, []);

    return filledFields;
}

/**
 * Fill form fields
 *
 * @param object tab    Target tab
 * @param object login  Login object
 * @param array  fields List of fields to fill
 * @return array List of filled fields
 */
async function fillFields(tab, login, fields) {
    // check that required fields are present
    for (var field of fields) {
        if (login.fields[field] === null) {
            throw new Error(`Required field is missing: ${field}`);
        }
    }

    // inject script
    await chrome.tabs.executeScript(tab.id, {
        allFrames: true,
        file: "js/inject.dist.js"
    });

    // build fill request
    var fillRequest = {
        allowForeign: false,
        allowNoSecret: false,
        origin: new URL(tab.url).origin,
        login: login,
        fields: fields
    };

    // fill form via injected script
    var filledFields = await dispatchFill(tab, fillRequest);

    // try again using same-origin frames if we couldn't fill a password field
    if (!filledFields.includes("secret")) {
        filledFields = filledFields.concat(await dispatchFill(tab, fillRequest, true));
    }

    // try again using all available frames if we couldn't fill a password field
    if (!filledFields.includes("secret")) {
        filledFields = filledFields.concat(await dispatchFill(tab, fillRequest, true, true));
    }

    // try again using same-origin frames, and don't require a password field
    if (!filledFields.length) {
        filledFields = filledFields.concat(await dispatchFill(tab, fillRequest, true, false, true));
    }

    // try again using all available frames, and don't require a password field
    if (!filledFields.length) {
        filledFields = filledFields.concat(await dispatchFill(tab, fillRequest, true, true, true));
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
                var tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
                var url = message.login.fields.url || message.login.domain;
                if (!url) {
                    throw new Error("No URL is defined for this entry");
                }
                if (!url.match(/:\/\//)) {
                    url = "http://" + url;
                }
                if (authListeners[tab.id]) {
                    chrome.tabs.onUpdated.removeListener(authListeners[tab.id]);
                    delete authListeners[tab.id];
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
                // get tab info
                var targetTab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];

                // dispatch initial fill request
                var filledFields = await fillFields(targetTab, message.login, ["login", "secret"]);

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
    var lines = login.raw.split(/[\r\n]+/).filter(line => line.trim().length > 0);
    lines.forEach(function(line) {
        // split key / value
        var parts = line
            .split(/(?<=^[^:]+):/)
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
    });

    // clean up unassigned fields
    for (var key in login.fields) {
        if (Array.isArray(login.fields[key])) {
            if (key == "secret" && lines.length) {
                login.fields.secret = lines[0];
            } else if (key == "login") {
                login.fields[key] = login.login.match(/([^\/]+)$/)[1];
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
