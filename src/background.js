//-------------------------------- Background initialisation --------------------------------//
"use strict";

require("chrome-extension-async");
const sha1 = require("sha1");
const idb = require("idb");
const helpers = require("./helpers");

// native application id
var appID = "com.github.browserpass.native";

// OTP extension id
var otpID = [
    "afjjoildnccgmjbblnklbohcbjehjaph", // webstore releases
    "jbnpmhhgnchcoljeobafpinmchnpdpin", // github releases
    "fcmmcnalhjjejhpnlfnddimcdlmpkbdf", // local unpacked
    "browserpass-otp@maximbaz.com" // firefox
];

// default settings
var defaultSettings = {
    autoSubmit: false,
    gpgPath: null,
    stores: {},
    foreignFills: {},
    username: null
};

var authListeners = {};

// the last text copied to the clipboard is stored here in order to be cleared after 60 seconds
let lastCopiedText = null;

chrome.browserAction.setBadgeBackgroundColor({
    color: "#666"
});

// watch for tab updates
chrome.tabs.onUpdated.addListener((tabId, info) => {
    // unregister any auth listeners for this tab
    if (info.status === "complete") {
        if (authListeners[tabId]) {
            chrome.webRequest.onAuthRequired.removeListener(authListeners[tabId]);
            delete authListeners[tabId];
        }
    }

    // refresh badge counter when url in a tab changes
    if (info.url) {
        updateMatchingPasswordsCount(tabId);
    }
});

// handle incoming messages
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    receiveMessage(message, sender, sendResponse);

    // allow async responses after this function returns
    return true;
});

// handle keyboard shortcuts
chrome.commands.onCommand.addListener(async command => {
    switch (command) {
        case "fillBest":
            try {
                const settings = await getFullSettings();
                if (settings.tab.url.match(/^(chrome|about):/)) {
                    // only fill on real domains
                    return;
                }
                handleMessage(settings, { action: "listFiles" }, listResults => {
                    const logins = helpers.prepareLogins(listResults.files, settings);
                    const bestLogin = helpers.filterSortLogins(logins, "", true)[0];
                    if (bestLogin) {
                        handleMessage(settings, { action: "fill", login: bestLogin }, () => {});
                    }
                });
            } catch (e) {
                console.log(e);
            }
            break;
    }
});

// handle fired alarms
chrome.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === "clearClipboard") {
        if (readFromClipboard() === lastCopiedText) {
            copyToClipboard("", false);
        }
        lastCopiedText = null;
    }
});

chrome.runtime.onInstalled.addListener(onExtensionInstalled);

//----------------------------------- Function definitions ----------------------------------//

/**
 * Set badge text with the number of matching password entries
 *
 * @since 3.0.0
 *
 * @param int tabId Tab id
 * @return void
 */
async function updateMatchingPasswordsCount(tabId) {
    try {
        const settings = await getFullSettings();
        var response = await hostAction(settings, "list");
        if (response.status != "ok") {
            throw new Error(JSON.stringify(response));
        }

        // Get tab info
        try {
            const tab = await chrome.tabs.get(tabId);
            settings.host = new URL(tab.url).hostname;
        } catch (e) {
            throw new Error(`Unable to determine domain of the tab with id ${tabId}`);
        }

        const logins = helpers.prepareLogins(response.data.files, settings);
        const matchedPasswordsCount = logins.reduce(
            (acc, login) => acc + (login.recent.count || login.inCurrentDomain ? 1 : 0),
            0
        );

        if (matchedPasswordsCount) {
            // Set badge for the current tab
            chrome.browserAction.setBadgeText({
                text: "" + matchedPasswordsCount,
                tabId: tabId
            });
        }
    } catch (e) {
        console.log(e);
    }
}

/**
 * Copy text to clipboard and optionally clear it from the clipboard after one minute
 *
 * @since 3.2.0
 *
 * @param string text Text to copy
 * @param boolean clear Whether to clear the clipboard after one minute
 * @return void
 */
function copyToClipboard(text, clear = true) {
    document.addEventListener(
        "copy",
        function(e) {
            e.clipboardData.setData("text/plain", text);
            e.preventDefault();
        },
        { once: true }
    );
    document.execCommand("copy");

    if (clear) {
        lastCopiedText = text;
        chrome.alarms.create("clearClipboard", { delayInMinutes: 1 });
    }
}

/**
 * Read plain text from clipboard
 *
 * @since 3.2.0
 *
 * @return string The current plaintext content of the clipboard
 */
function readFromClipboard() {
    const ta = document.createElement("textarea");
    // these lines are carefully crafted to make paste work in both Chrome and Firefox
    ta.contentEditable = true;
    ta.textContent = "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("paste");
    const content = ta.value;
    document.body.removeChild(ta);
    return content;
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
async function saveRecent(settings, login, remove = false) {
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

    // a new entry was added to the popup matching list, need to refresh the count
    if (!login.inCurrentDomain && login.recent.count === 1) {
        updateMatchingPasswordsCount(settings.tab.id);
    }

    // save to usage log
    try {
        const DB_VERSION = 1;
        const db = await idb.openDB("browserpass", DB_VERSION, {
            upgrade(db) {
                db.createObjectStore("log", { keyPath: "time" });
            }
        });
        await db.add("log", { time: Date.now(), host: settings.host, login: login.login });
    } catch {
        // ignore any errors and proceed without saving a log entry to Indexed DB
    }
}

/**
 * Call injected code to fill the form
 *
 * @param object  settings      Settings object
 * @param object  request       Request details
 * @param boolean allFrames     Dispatch to all frames
 * @param boolean allowForeign  Allow foreign-origin iframes
 * @param boolean allowNoSecret Allow forms that don't contain a password field
 * @return array list of filled fields
 */
async function dispatchFill(settings, request, allFrames, allowForeign, allowNoSecret) {
    request = Object.assign(deepCopy(request), {
        allowForeign: allowForeign,
        allowNoSecret: allowNoSecret,
        foreignFills: settings.foreignFills[settings.host] || {}
    });

    let perFrameResults = await chrome.tabs.executeScript(settings.tab.id, {
        allFrames: allFrames,
        code: `window.browserpass.fillLogin(${JSON.stringify(request)});`
    });

    // merge filled fields into a single array
    let filledFields = perFrameResults
        .reduce((merged, frameResult) => merged.concat(frameResult.filledFields), [])
        .filter((val, i, merged) => merged.indexOf(val) === i);

    // if user answered a foreign-origin confirmation,
    // store the answers in the settings
    let foreignFillsChanged = false;
    for (let frame of perFrameResults) {
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
 * Call injected code to focus or submit the form
 *
 * @param object  settings      Settings object
 * @param object  request       Request details
 * @param boolean allFrames     Dispatch to all frames
 * @param boolean allowForeign  Allow foreign-origin iframes
 * @return void
 */
async function dispatchFocusOrSubmit(settings, request, allFrames, allowForeign) {
    request = Object.assign(deepCopy(request), {
        allowForeign: allowForeign,
        foreignFills: settings.foreignFills[settings.host] || {}
    });

    let perFrameResults = await chrome.tabs.executeScript(settings.tab.id, {
        allFrames: allFrames,
        code: `window.browserpass.focusOrSubmit(${JSON.stringify(request)});`
    });

    // if necessary, dispatch Enter keypress to autosubmit the form
    // currently only works on Chromium and requires debugger permission
    try {
        for (let frame of perFrameResults) {
            if (frame.needPressEnter) {
                chrome.debugger.attach({ tabId: settings.tab.id }, "1.2");
                for (let type of ["keyDown", "keyUp"]) {
                    chrome.debugger.sendCommand(
                        { tabId: settings.tab.id },
                        "Input.dispatchKeyEvent",
                        {
                            type: type,
                            windowsVirtualKeyCode: 13,
                            nativeVirtualKeyCode: 13
                        }
                    );
                }
                chrome.debugger.detach({ tabId: settings.tab.id });
                break;
            }
        }
    } catch (e) {}
}

/**
 * Inject script
 *
 * @param object settings Settings object
 * @param boolean allFrames Inject in all frames
 * @return object Cancellable promise
 */
async function injectScript(settings, allFrames) {
    const MAX_WAIT = 1000;

    return new Promise(async (resolve, reject) => {
        const waitTimeout = setTimeout(reject, MAX_WAIT);
        await chrome.tabs.executeScript(settings.tab.id, {
            allFrames: allFrames,
            file: "js/inject.dist.js"
        });
        clearTimeout(waitTimeout);
        resolve(true);
    });
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
    // inject script
    try {
        await injectScript(settings, false);
    } catch {
        throw new Error("Unable to inject script in the top frame");
    }

    let injectedAllFrames = false;
    try {
        await injectScript(settings, true);
        injectedAllFrames = true;
    } catch {
        // we'll proceed with trying to fill only the top frame
    }

    // build fill request
    var fillRequest = {
        origin: new URL(settings.tab.url).origin,
        login: login,
        fields: fields
    };

    let allFrames = false;
    let allowForeign = false;
    let allowNoSecret = !fields.includes("secret");
    let filledFields = [];
    let importantFieldToFill = fields.includes("openid") ? "openid" : "secret";

    // fill form via injected script
    filledFields = filledFields.concat(
        await dispatchFill(settings, fillRequest, allFrames, allowForeign, allowNoSecret)
    );

    if (injectedAllFrames) {
        // try again using same-origin frames if we couldn't fill an "important" field
        if (!filledFields.includes(importantFieldToFill)) {
            allFrames = true;
            filledFields = filledFields.concat(
                await dispatchFill(settings, fillRequest, allFrames, allowForeign, allowNoSecret)
            );
        }

        // try again using all available frames if we couldn't fill an "important" field
        if (
            !filledFields.includes(importantFieldToFill) &&
            settings.foreignFills[settings.host] !== false
        ) {
            allowForeign = true;
            filledFields = filledFields.concat(
                await dispatchFill(settings, fillRequest, allFrames, allowForeign, allowNoSecret)
            );
        }
    }

    // try again, but don't require a password field (if it was required until now)
    if (!allowNoSecret) {
        allowNoSecret = true;

        // try again using only the top frame
        if (!filledFields.length) {
            allFrames = false;
            allowForeign = false;
            filledFields = filledFields.concat(
                await dispatchFill(settings, fillRequest, allFrames, allowForeign, allowNoSecret)
            );
        }

        if (injectedAllFrames) {
            // try again using same-origin frames
            if (!filledFields.length) {
                allFrames = true;
                filledFields = filledFields.concat(
                    await dispatchFill(
                        settings,
                        fillRequest,
                        allFrames,
                        allowForeign,
                        allowNoSecret
                    )
                );
            }

            // try again using all available frames
            if (!filledFields.length && settings.foreignFills[settings.host] !== false) {
                allowForeign = true;
                filledFields = filledFields.concat(
                    await dispatchFill(
                        settings,
                        fillRequest,
                        allFrames,
                        allowForeign,
                        allowNoSecret
                    )
                );
            }
        }
    }

    if (!filledFields.length) {
        throw new Error(`No fillable forms available for fields: ${fields.join(", ")}`);
    }

    // build focus or submit request
    let focusOrSubmitRequest = {
        origin: new URL(settings.tab.url).origin,
        autoSubmit: getSetting("autoSubmit", login, settings),
        filledFields: filledFields
    };

    // try to focus or submit form with the settings that were used to fill it
    await dispatchFocusOrSubmit(settings, focusOrSubmitRequest, allFrames, allowForeign);

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
 * Get full settings from the extension and host application
 *
 * @since 3.0.0
 *
 * @return object Full settings object
 */
async function getFullSettings() {
    var settings = getLocalSettings();
    var configureSettings = Object.assign(deepCopy(settings), {
        defaultStore: {}
    });
    var response = await hostAction(configureSettings, "configure");
    if (response.status != "ok") {
        settings.hostError = response;
    }
    settings.version = response.version;

    // Fill store settings, only makes sense if 'configure' succeeded
    if (response.status === "ok") {
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
        return;
    }

    // fetch file & parse fields if a login entry is present
    try {
        if (typeof message.login !== "undefined") {
            await parseFields(settings, message.login);
        }
    } catch (e) {
        sendResponse({
            status: "error",
            message: "Unable to fetch and parse login fields: " + e.toString()
        });
        return;
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
                    message: e.message
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
                await saveRecent(settings, message.login);
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
                await saveRecent(settings, message.login);
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: "Unable to copy username"
                });
            }
            break;

        case "launch":
        case "launchInNewTab":
            try {
                var url = message.login.fields.url || message.login.domain;
                if (!url) {
                    throw new Error("No URL is defined for this entry");
                }
                if (!url.match(/:\/\//)) {
                    url = "http://" + url;
                }

                const tab =
                    message.action === "launch"
                        ? await chrome.tabs.update(settings.tab.id, { url: url })
                        : await chrome.tabs.create({ url: url });

                if (authListeners[tab.id]) {
                    chrome.tabs.onUpdated.removeListener(authListeners[tab.id]);
                    delete authListeners[tab.id];
                }
                authListeners[tab.id] = handleModalAuth.bind({
                    url: url,
                    login: message.login
                });
                chrome.webRequest.onAuthRequired.addListener(
                    authListeners[tab.id],
                    { urls: ["*://*/*"], tabId: tab.id },
                    ["blocking"]
                );
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
                let fields = message.login.fields.openid ? ["openid"] : ["login", "secret"];

                // dispatch initial fill request
                var filledFields = await fillFields(settings, message.login, fields);
                await saveRecent(settings, message.login);

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
        case "clearUsageData":
            try {
                await clearUsageData();
                sendResponse({ status: "ok" });
            } catch (e) {
                sendResponse({
                    status: "error",
                    message: e.message
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

    // trigger browserpass-otp
    if (typeof message.login !== "undefined" && message.login.fields.hasOwnProperty("otp")) {
        triggerOTPExtension(settings, message.action, message.login.fields.otp);
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
        login: ["login", "username", "user"],
        openid: ["openid"],
        otp: ["otp", "totp", "hotp"],
        url: ["url", "uri", "website", "site", "link", "launch"]
    };
    login.settings = {
        autoSubmit: { name: "autosubmit", type: "bool" }
    };
    var lines = login.raw.split(/[\r\n]+/).filter(line => line.trim().length > 0);
    lines.forEach(function(line) {
        // check for uri-encoded otp
        if (line.match(/^otpauth:\/\/.+/)) {
            login.fields.otp = { key: null, data: line };
            return;
        }

        // split key / value & ignore non-k/v lines
        var parts = line.match(/^(.+?):(.+)$/);
        if (parts === null) {
            return;
        }
        parts = parts
            .slice(1)
            .map(value => value.trim())
            .filter(value => value.length);
        if (parts.length != 2) {
            return;
        }

        // assign to fields
        for (var key in login.fields) {
            if (
                Array.isArray(login.fields[key]) &&
                login.fields[key].includes(parts[0].toLowerCase())
            ) {
                if (key === "otp") {
                    login.fields[key] = { key: parts[0].toLowerCase(), data: parts[1] };
                } else {
                    login.fields[key] = parts[1];
                }
                break;
            }
        }

        // assign to settings
        for (var key in login.settings) {
            if (
                typeof login.settings[key].type !== "undefined" &&
                login.settings[key].name === parts[0].toLowerCase()
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
            if (key === "secret" && lines.length) {
                login.fields.secret = lines[0];
            } else if (key === "login") {
                const defaultUsername = getSetting("username", login, settings);
                login.fields[key] = defaultUsername || login.login.match(/([^\/]+)$/)[1];
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

    try {
        const settings = await getFullSettings();
        handleMessage(settings, message, sendResponse);
    } catch (e) {
        // handle error
        console.log(e);
        sendResponse({ status: "error", message: e.toString() });
    }
}

/**
 * Clear usage data
 *
 * @since 3.0.10
 *
 * @return void
 */
async function clearUsageData() {
    // clear local storage
    localStorage.removeItem("foreignFills");
    localStorage.removeItem("recent");
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith("recent:")) {
            localStorage.removeItem(key);
        }
    });

    // clear Indexed DB
    await idb.deleteDB("browserpass");
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
    let settingsToSave = deepCopy(settings);

    // 'default' is our reserved name for the default store
    delete settingsToSave.stores.default;

    // verify that the native host is happy with the provided settings
    var response = await hostAction(settingsToSave, "configure");
    if (response.status != "ok") {
        throw new Error(`${response.params.message}: ${response.params.error}`);
    }

    // before save, make sure to remove store settings that we receive from the host app
    if (typeof settingsToSave.stores === "object") {
        for (var store in settingsToSave.stores) {
            delete settingsToSave.stores[store].settings;
        }
    }

    for (var key in defaultSettings) {
        if (settingsToSave.hasOwnProperty(key)) {
            localStorage.setItem(key, JSON.stringify(settingsToSave[key]));
        }
    }
}

/**
 * Trigger OTP extension (browserpass-otp)
 *
 * @since 3.0.13
 *
 * @param object settings Settings object
 * @param string action   Browserpass action
 * @param object otp      OTP field data
 * @return void
 */
function triggerOTPExtension(settings, action, otp) {
    // trigger otp extension
    for (let targetID of otpID) {
        chrome.runtime
            .sendMessage(targetID, {
                version: chrome.runtime.getManifest().version,
                action: action,
                otp: otp,
                settings: {
                    host: settings.host,
                    tab: settings.tab
                }
            })
            // Both response & error are noop functions, because we don't care about
            // the response, and if there's an error it just means the otp extension
            // is probably not installed. We can't detect that without requesting the
            // management permission, so this is an acceptable workaround.
            .then(noop => null, noop => null);
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
            iconUrl: "icon.png",
            type: "basic"
        });
    };

    if (details.reason === "install") {
        if (localStorage.getItem("installed") === null) {
            localStorage.setItem("installed", Date.now());
            show(
                "installed",
                "browserpass: Install native host app",
                "Remember to install the complementary native host app to use this extension.\n" +
                    "Instructions here: https://github.com/browserpass/browserpass-native"
            );
        }
    } else if (details.reason === "update") {
        var changelog = {
            3002000: "New permissions added to clear copied credentials after 60 seconds.",
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
