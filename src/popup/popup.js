//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var TldJS = require("tldjs");
var Interface = require("./interface");

if (typeof browser === "undefined") {
    var browser = chrome;
}

// wrap with current tab & settings
browser.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
    try {
        var response = await browser.runtime.sendMessage({ action: "getSettings" });
        if (response.status == "ok") {
            var settings = response.settings;
            settings.tab = tabs[0];
            settings.host = new URL(settings.tab.url).hostname;
            run(settings);
        } else {
            throw new Error(response.message);
        }
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
 */
function handleError(error) {
    console.log(error);
    var errorNode = document.createElement("div");
    errorNode.setAttribute("class", "part error");
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
        var response = await browser.runtime.sendMessage({ action: "listFiles" });
        var logins = [];
        var index = 0;
        for (var store in response) {
            for (var key in response[store]) {
                // set login fields
                var login = {
                    index: index++,
                    store: store,
                    login: response[store][key].replace(/\.gpg$/i, "")
                };
                login.domain = pathToDomain(login.store + "/" + login.login);
                login.active =
                    settings.host == login.domain || settings.host.endsWith("." + login.domain);

                // bind handlers
                login.doAction = withLogin.bind(login);

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
function withLogin(action) {
    // placeholder stub
    alert("Login action (" + action + "): " + this.login);
}
