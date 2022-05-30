//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const Interface = require("./interface");
const DetailsInterface = require("./detailsInterface");
const helpers = require("../helpers");
const m = require("mithril");
const AddEditInterface = require("./addEditInterface");

run();

//----------------------------------- Function definitions ----------------------------------//

/**
 * Run the main popup logic
 *
 * @since 3.0.0
 *
 * @return void
 */
async function run() {
    try {
        let settingsModel = new Settings();

        // get user settings
        var logins = [],
            settings = await settingsModel.get(),
            root = document.getElementsByTagName("html")[0];
        root.classList.remove("colors-dark");
        root.classList.add(`colors-${settings.theme}`);

        // get list of logins
        logins = await Login.prototype.getAll(settings);

        const LoginView = new AddEditInterface(settingsModel);
        m.route(document.body, "/list", {
            "/list": new Interface(settings, logins),
            "/details/:storeid/:login": new DetailsInterface(settingsModel),
            "/edit/:storeid/:login": LoginView,
            "/add": LoginView,
        });
    } catch (e) {
        helpers.handleError(e);
    }
}
