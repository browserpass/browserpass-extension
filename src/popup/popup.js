//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");

// models
const Login = require("./models/Login");
const Settings = require("./models/Settings");
// utils, libs
const helpers = require("../helpers");
const m = require("mithril");
// components
const AddEditInterface = require("./addEditInterface");
const DetailsInterface = require("./detailsInterface");
const Interface = require("./interface");
const layout = require("./layoutInterface");

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
        /**
         * Create instance of settings, which will cache
         * first request of settings which will be re-used
         * for subsequent requests. Pass this settings
         * instance pre-cached to each of the views.
         */
        let settingsModel = new Settings();

        // get user settings
        var logins = [],
            settings = await settingsModel.get(),
            root = document.getElementsByTagName("html")[0];
        root.classList.remove("colors-dark");
        root.classList.add(`colors-${settings.theme}`);

        // set theme
        const theme =
            settings.theme === "auto"
                ? window.matchMedia("(prefers-color-scheme: dark)").matches
                    ? "dark"
                    : "light"
                : settings.theme;
        root.classList.remove("colors-light", "colors-dark");
        root.classList.add(`colors-${theme}`);

        // get list of logins
        logins = await Login.prototype.getAll(settings);
        layout.setSessionSettings(settings);
        // save list of logins to validate when adding
        // a new one will not overwrite any existing ones
        layout.setStoreLogins(logins.raw);

        const LoginView = new AddEditInterface(settingsModel);
        m.route(document.body, "/list", {
            "/list": page(new Interface(settings, logins.processed)),
            "/details/:storeid/:login": page(new DetailsInterface(settingsModel)),
            "/edit/:storeid/:login": page(LoginView),
            "/add": page(LoginView),
        });
    } catch (e) {
        helpers.handleError(e);
    }
}

function page(component) {
    return {
        render: function (vnode) {
            return m(layout.LayoutInterface, m(component, { context: vnode.attrs }));
        },
    };
}
