//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var TldJS = require("tldjs");
var sha1 = require("sha1");
var Interface = require("./interface");

// wrap with current tab & settings
chrome.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
    try {
        var response = await chrome.runtime.sendMessage({ action: "getSettings" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }
        var settings = response.settings;
        settings.tab = tabs[0];
        settings.host = new URL(settings.tab.url).hostname;
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
        run(settings);
    } catch (e) {
        handleError(e);
    }
});

//----------------------------------- Function definitions ----------------------------------//

/**
 * Handle an error
 *
 * @since 3.0.0
 *
 * @param Error error Error object
 * @param string type Error type
 */
function handleError(error, type = "error") {
    if (type == "error") {
        console.log(error);
    }
    var errorNode = document.createElement("div");
    errorNode.setAttribute("class", "part " + type);
    errorNode.textContent = error.toString();
    document.body.innerHTML = "";
    document.body.appendChild(errorNode);
}

/**
 * Get the deepest available domain component of a path
 *
 * @since 3.0.0
 *
 * @param string path Path to parse
 * @return string|null Extracted domain
 */
function pathToDomain(path) {
    var parts = path.split(/\//).reverse();
    for (var key in parts) {
        if (parts[key].indexOf("@") >= 0) {
            continue;
        }
        var t = TldJS.parse(parts[key]);
        if (t.isValid && t.domain !== null) {
            return t.hostname;
        }
    }

    return null;
}

/**
 * Run the main popup logic
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @return void
 */
async function run(settings) {
    try {
        // get list of logins
        var response = await chrome.runtime.sendMessage({ action: "listFiles" });
        if (response.status != "ok") {
            throw new Error(e);
        }

        var logins = [];
        var index = 0;
        var recent = localStorage.getItem("recent:" + settings.host);
        if (recent) {
            recent = JSON.parse(recent);
        }
        for (var storeId in response.files) {
            for (var key in response.files[storeId]) {
                // set login fields
                var login = {
                    index: index++,
                    store: settings.stores[storeId],
                    login: response.files[storeId][key].replace(/\.gpg$/i, ""),
                    allowFill: true
                };
                login.domain = pathToDomain(storeId + "/" + login.login);
                login.inCurrentDomain =
                    settings.host == login.domain || settings.host.endsWith("." + login.domain);
                login.recent =
                    settings.recent[sha1(settings.host + sha1(login.store.id + sha1(login.login)))];
                if (!login.recent) {
                    login.recent = {
                        when: 0,
                        count: 0
                    };
                }
                // bind handlers
                login.doAction = withLogin.bind({ settings: settings, login: login });

                logins.push(login);
            }
        }
        var popup = new Interface(settings, logins);
        popup.attach(document.body);
    } catch (e) {
        handleError(e);
    }
}

/**
 * Save login to recent list for current domain
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
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
 * Do a login action
 *
 * @since 3.0.0
 *
 * @param string action Action to take
 * @return void
 */
async function withLogin(action) {
    try {
        // replace popup with a "please wait" notice
        switch (action) {
            case "fill":
                handleError("Filling login details...", "notice");
                break;
            case "launch":
                handleError("Launching URL...", "notice");
                break;
            case "copyPassword":
                handleError("Copying password to clipboard...", "notice");
                break;
            case "copyUsername":
                handleError("Copying username to clipboard...", "notice");
                break;
            default:
                handleError("Please wait...", "notice");
                break;
        }

        // hand off action to background script
        var response = await chrome.runtime.sendMessage({
            action: action,
            login: this.login
        });
        if (response.status != "ok") {
            throw new Error(response.message);
        } else {
            switch (action) {
                case "fill":
                case "copyPassword":
                case "copyUsername":
                    saveRecent(this.settings, this.login);
            }
            window.close();
        }
    } catch (e) {
        handleError(e);
    }
}
