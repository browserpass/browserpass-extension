//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
const Interface = require("./interface");

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
 * Get settings
 *
 * @since 3.0.9
 *
 * @return object Settings object
 */
async function getSettings() {
    var response = await chrome.runtime.sendMessage({ action: "getSettings" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    // 'default' store must not be displayed or later attempted to be saved
    delete response.settings.stores.default;

    return response.settings;
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
        settings: settings,
    });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    // reload settings
    return await getSettings();
}

/**
 * Clear usage data
 *
 * @since 3.0.10
 *
 * @return void
 */
async function clearUsageData() {
    var response = await chrome.runtime.sendMessage({ action: "clearUsageData" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }
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
        var options = new Interface(await getSettings(), saveSettings, clearUsageData);
        options.attach(document.body);
    } catch (e) {
        handleError(e);
    }
}
