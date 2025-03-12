//------------------------------------- Initialisation --------------------------------------//
"use strict";

const m = require("mithril");
const helpers = require("./helpers");
const notify = require("./popup/notifications");

const containsNumbersRegEx = RegExp(/[0-9]/);
const containsSymbolsRegEx = RegExp(/[\p{P}\p{S}]/, "u");

module.exports = {
    handleError,
    highlight,
    parseAuthUrl,
    withLogin,
};

//----------------------------------- Function definitions ----------------------------------//

/**
 * Highlight password characters
 *
 * @since 3.8.0
 *
 * @param {string} secret a string to be split by character
 * @return {array} mithril vnodes to be rendered
 */
function highlight(secret = "") {
    return secret.split("").map((c) => {
        if (c.match(containsNumbersRegEx)) {
            return m("span.char.num", c);
        } else if (c.match(containsSymbolsRegEx)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });
}

/**
 * Handle an error
 *
 * @since 3.0.0
 *
 * @param Error error Error object
 * @param string type Error type
 */
function handleError(error, type = "error") {
    switch (type) {
        case "error":
            console.error(error);
            // disable error timeout, to allow necessary user action
            notify.errorMsg(error.toString(), 0);
            break;

        case "warning":
            notify.warningMsg(error.toString());
            console.warn(error.toString());
            break;

        case "success":
            notify.successMsg(error.toString());
            console.info(error.toString());
            break;

        case "info":
        default:
            notify.infoMsg(error.toString());
            console.info(error.toString());
            break;
    }
}

/**
 * Returns decoded url param for "authUrl" if present
 * @since 3.10.0
 * @returns string | null
 */
function parseAuthUrl() {
    const currentUrl = (window && `${window.location.origin}${window.location.pathname}`) || null;
    console.debug("parseAuthUrl", { currentUrl });
    if (currentUrl === helpers.getPopupUrl()) {
        const encodedUrl = new URLSearchParams(window.location.search).get("authUrl");
        console.debug("parseAuthUrl", { encodedUrl });
        if (encodedUrl) {
            return decodeURIComponent(encodedUrl);
        }
    }
    return null;
}

/**
 * Do a login action
 *
 * @since 3.0.0
 *
 * @param string action Action to take
 * @param object params Action parameters
 * @return void
 */
async function withLogin(action, params = {}) {
    try {
        switch (action) {
            case "fill":
                handleError("Filling login details...", "info");
                break;
            case "launch":
                handleError("Launching URL...", "info");
                break;
            case "launchInNewTab":
                handleError("Launching URL in a new tab...", "info");
                break;
            case "copyPassword":
                handleError("Copying password to clipboard...", "info");
                break;
            case "copyUsername":
                handleError("Copying username to clipboard...", "info");
                break;
            case "copyOTP":
                handleError("Copying OTP token to clipboard...", "info");
                break;
            default:
                handleError("Please wait...", "info");
                break;
        }

        const login = helpers.deepCopy(this.login);

        // hand off action to background script
        var response = await chrome.runtime.sendMessage({ action, login, params });
        if (response.status != "ok") {
            throw new Error(response.message);
        } else {
            if (response.login && typeof response.login === "object") {
                response.login.doAction = withLogin.bind({
                    settings: this.settings,
                    login: response.login,
                });
            } else {
                window.close();
            }
        }
    } catch (e) {
        handleError(e);
    }
}
