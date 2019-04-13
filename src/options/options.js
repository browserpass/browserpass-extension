//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var Interface = require("./interface");

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
 * Save settings
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @return object Settings object
 */
async function saveSettings(settings) {
    var response = await chrome.runtime.sendMessage({
        action: "saveSettings",
        settings: settings
    });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    // reload settings
    var response = await chrome.runtime.sendMessage({ action: "getSettings" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    return response.settings;
}

/**
 * Run the main options logic
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

        var options = new Interface(response.settings, saveSettings);
        options.attach(document.body);
    } catch (e) {
        handleError(e);
    }
}
