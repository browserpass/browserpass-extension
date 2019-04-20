//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var TldJS = require("tldjs");
var sha1 = require("sha1");
var Interface = require("./interface");
var AddInterface = require("./add-interface");

run();

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
 * @param string path        Path to parse
 * @param string currentHost Current hostname for the active tab
 * @return string|null Extracted domain
 */
function pathToDomain(path, currentHost) {
    var parts = path.split(/\//).reverse();
    for (var key in parts) {
        if (parts[key].indexOf("@") >= 0) {
            continue;
        }
        var t = TldJS.parse(parts[key]);
        if (
            t.isValid &&
            ((t.tldExists && t.domain !== null) ||
                t.hostname === currentHost ||
                currentHost.endsWith(`.${t.hostname}`))
        ) {
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
 * @return void
 */
async function run() {
    try {
        var response = await chrome.runtime.sendMessage({ action: "getSettings" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }
        var settings = response.settings;

        if (settings.hasOwnProperty("hostError")) {
            throw new Error(settings.hostError.params.message);
        }

        if (typeof settings.host === "undefined") {
            throw new Error("Unable to retrieve current tab information");
        }

        response = await chrome.runtime.sendMessage({ action: "listCredentials" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }

        if (response.credentials.length > 0) {
            var popup = new AddInterface(response.credentials, settings);
            for (let credential of response.credentials) {
                credential.doAction = withCredential.bind({
                    settings: settings,
                    credentials: credential,
                    interface: popup
                });
            }
            popup.attach(document.body);
            return;
        }

        // get list of logins
        response = await chrome.runtime.sendMessage({ action: "listFiles" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }

        var logins = [];
        var index = 0;
        for (var storeId in response.files) {
            for (var key in response.files[storeId]) {
                // set login fields
                var login = {
                    index: index++,
                    store: settings.stores[storeId],
                    login: response.files[storeId][key].replace(/\.gpg$/i, ""),
                    allowFill: true
                };
                login.domain = pathToDomain(storeId + "/" + login.login, settings.host);
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
            case "launchInNewTab":
                handleError("Launching URL in a new tab...", "notice");
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

        // Firefox requires data to be serializable,
        // this removes everything offending such as functions
        const login = JSON.parse(JSON.stringify(this.login));

        // hand off action to background script
        var response = await chrome.runtime.sendMessage({
            action: action,
            login: login
        });
        if (response.status != "ok") {
            throw new Error(response.message);
        } else {
            window.close();
        }
    } catch (e) {
        handleError(e);
    }
}

async function withCredential(action, storeID) {
    const credentials = JSON.parse(JSON.stringify(this.credentials));
    let response = await chrome.runtime.sendMessage({
        action: action,
        credentials: credentials,
        storeID: storeID
    });

    switch (action) {
        case "dismiss":
            window.close();
            break;
        case "create":
            if (response.status != "ok") handleError(Error(response.message));

            let credentialsLeft = this.interface.dismissCredential();
            if (credentialsLeft === 0) window.close();
            break;
    }
}
