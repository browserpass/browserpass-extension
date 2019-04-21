//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
const sha1 = require("sha1");
const Interface = require("./interface");
const helpers = require("../helpers");

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
                login.domain = helpers.pathToDomain(storeId + "/" + login.login, settings.host);
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
