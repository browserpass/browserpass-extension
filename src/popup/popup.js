//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const Interface = require("./interface");
const DetailsInterface = require("./detailsInterface");
const helpers = require("../helpers");
const m = require("mithril");
const LoginForm = require("./views/LoginForm");

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
    var node = { view: () => m(`div.part.${type}`, error.toString()) };
    m.mount(document.body, node);
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
        // get user settings
        var logins = [],
            settings = await Settings.get(),
            root = document.getElementsByTagName("html")[0];
        root.classList.remove("colors-dark");
        root.classList.add(`colors-${settings.theme}`);

        // get list of logins
        logins = await Login.loadList(settings);

        for (let login of logins) {
            login.doAction = withLogin.bind({ settings: settings, login: login });
        }

        m.route(document.body, "/list", {
            "/list": new Interface(settings, logins),
            "/details/:storeid/:login": LoginForm,
            "/add": LoginForm,
        });
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
 * @param object params Action parameters
 * @return void
 */
async function withLogin(action, params = {}) {
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
            case "copyOTP":
                handleError("Copying OTP token to clipboard...", "notice");
                break;
            case "getDetails":
                handleError("Loading entry details...", "notice");
                break;
            case "save":
                // no in-progress notice
                break;
            default:
                handleError("Please wait...", "notice");
                break;
        }

        // Firefox requires data to be serializable,
        // this removes everything offending such as functions
        const login = JSON.parse(JSON.stringify(this.login));

        // hand off action to background script
        // console.log({ action, login, params });
        var response = await chrome.runtime.sendMessage({ action, login, params });
        // console.log(response);
        if (response.status != "ok") {
            throw new Error(response.message);
        } else {
            if (response.login && typeof response.login === "object") {
                response.login.doAction = withLogin.bind({
                    settings: this.settings,
                    login: response.login,
                });
            }
            if (action === "getDetails") {
                var details = new DetailsInterface(this.settings, response.login);
                details.attach(document.body);
            } else if (action === "save") {
                handleError("Successfully saved password entry", "notice");
                setTimeout(window.close, 1000);
            } else {
                window.close();
            }
        }
    } catch (e) {
        handleError(e);
    }
}
