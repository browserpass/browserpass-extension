//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
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

        var root = document.getElementsByTagName("html")[0];
        root.classList.remove("colors-dark");
        root.classList.add(`colors-${settings.theme}`);

        if (settings.hasOwnProperty("hostError")) {
            throw new Error(settings.hostError.params.message);
        }

        if (typeof settings.origin === "undefined") {
            throw new Error("Unable to retrieve current tab information");
        }

        // get list of logins
        response = await chrome.runtime.sendMessage({ action: "listFiles" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }

        const logins = helpers.prepareLogins(response.files, settings);
        for (let login of logins) {
            login.doAction = withLogin.bind({ settings: settings, login: login });
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
            login: login,
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
