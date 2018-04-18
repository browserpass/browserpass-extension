//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
var Mithril = require("mithril");
var TldJS = require("tldjs");
var FuzzySort = require("fuzzysort");

var startTime = Date.now();
var settings = null;
var error = null;
var notice = null;
var logins = [];
var domainLogins = [];

if (typeof browser === "undefined") {
    var browser = chrome;
}

// performance debugging function - TODO remove once extension is ready for release
function checkpoint(activity) {
    console.log("Elapsed: " + (Date.now() - startTime) + "ms (" + activity + ")");
}

// wrap with current tab & settings
checkpoint("start");
browser.tabs.query({ active: true, currentWindow: true }, async function(tabs) {
    checkpoint("after tab");
    try {
        var response = await browser.runtime.sendMessage({ action: "getSettings" });
        if (response.status == "ok") {
            checkpoint("after getSettings");
            settings = response.settings;
            settings.tab = tabs[0];
            settings.host = new URL(settings.tab.url).hostname;
            run();
        } else {
            throw new Exception(response.message);
        }
    } catch (e) {
        console.log(e.toString()); // TODO
    }
});

//----------------------------------- Function definitions ----------------------------------//

/**
 * Get the logins which match the provided domain
 *
 * @since 3.0.0
 *
 * @param string domain Domain to filter against
 * @return array
 */
function getDomainLogins(domain) {
    var domainLogins = [];
    var t = TldJS.parse(domain);

    // ignore invalid domains
    if (!t.isValid || t.domain === null) {
        return [];
    }

    // filter against the domain
    for (var key in logins) {
        if (logins[key].domain === t.hostname) {
            domainLogins.push(logins[key]);
        }
    }

    // recurse and add matching domains to the list
    domainLogins = domainLogins.concat(getDomainLogins(t.hostname.replace(/^.+?\./, "")));

    return domainLogins;
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
 * Render the popup contents
 *
 * @since 3.0.0
 *
 * @return void
 */
function render() {
    var body = document.getElementsByTagName("body")[0];
    Mithril.mount(body, {
        view: function() {
            return [renderError(), renderNotice(), renderList()];
        }
    });
    checkpoint("after render");
}

/**
 * Render any error messages
 *
 * @since 3.0.0
 *
 * @return Vnode
 */
function renderError() {
    return error === null ? null : Mithril("div.part.error", error);
}

/**
 * Render any notices
 *
 * @since 3.0.0
 *
 * @return Vnode
 */
function renderNotice() {
    return notice === null ? null : Mithril("div.part.notice", notice);
}

/**
 * Render the list of available logins
 *
 * @since 3.0.0
 *
 * @return []Vnode
 */
function renderList() {
    if (!logins.length) {
        showError("There are no matching logins available");
        return null;
    }

    var list = [];
    domainLogins.forEach(function(login) {
        list.push(
            Mithril("div.part.login", { title: login.domain }, login.store + ":" + login.login)
        );
    });
    if (!list.length) {
        showNotice("There are no logins matching " + settings.host + ".");
    }

    checkpoint("after renderList");
    return Mithril("div.logins", list);
}

async function run() {
    try {
        // get list of logins
        var response = await browser.runtime.sendMessage({ action: "listFiles" });
        checkpoint("after listFiles");
        for (var store in response) {
            for (var key in response[store]) {
                var login = {
                    store: store,
                    login: response[store][key].replace(/\.gpg$/i, "")
                };
                login.domain = pathToDomain(login.store + "/" + login.login);
                logins.push(login);
            }
        }
        checkpoint("after listFiles post-processing");

        domainLogins = getDomainLogins(settings.host);

        render();
    } catch (e) {
        showError(e.toString());
    }
}

/**
 * Show an error message
 *
 * @since 3.0.0
 *
 * @param string message Message text
 */
function showError(message) {
    error = message;
    Mithril.redraw();
}

/**
 * Show an informational message
 *
 * @since 3.0.0
 *
 * @param string message Message text
 */
function showNotice(message) {
    notice = message;
    Mithril.redraw();
}
