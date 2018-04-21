//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var TldJS = require("tldjs");
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
        var logins = [];
        var index = 0;
        for (var store in response) {
            var storePath = settings.stores[store].path;
            for (var key in response[store]) {
                // set login fields
                var login = {
                    index: index++,
                    store: store,
                    login: response[store][key].replace(/\.gpg$/i, ""),
                    allowFill: true
                    recent: -1
                };
                login.domain = pathToDomain(login.store + "/" + login.login);
                login.inCurrentDomain =
                    settings.host == login.domain || settings.host.endsWith("." + login.domain);
                var recent = localStorage.getItem("recent:" + settings.host);
                if (recent) {
                    recent = JSON.parse(recent);
                    for (var i = 0; i < recent.length; i++) {
                        if (recent[i].store == storePath && recent[i].login == login.login) {
                            login.recent = i;
                            login.when = recent[i].when;
                            break;
                        }
                    }
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
    var recentName = "recent:" + settings.host;
    var recent = localStorage.getItem(recentName);
    if (recent) {
        recent = JSON.parse(recent).filter(
            entry => entry.store != settings.stores[login.store].path || entry.login != login.login
        );
    } else {
        recent = [];
    }
    if (!remove) {
        recent.push({
            store: settings.stores[login.store].path,
            login: login.login,
            when: Date.now()
        });
    }
    localStorage.setItem(recentName, JSON.stringify(recent));
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
                var havePermission = await chrome.permissions.request({
                    permissions: ["webRequest", "webRequestBlocking"],
                    origins: ["http://*/*", "https://*/*"]
                });
                if (!havePermission) {
                    throw new Error("Browserpass requires additional permissions to proceed");
                }
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
