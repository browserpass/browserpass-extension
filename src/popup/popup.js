//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const layout = require("./layoutInterface");
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

        // get list of logins
        logins = await Login.prototype.getAll(settings);

        const LoginView = new AddEditInterface(settingsModel);
        m.route(document.body, "/list", {
            "/list": page(new Interface(settings, logins)),
            "/details/:storeid/:login": page(new DetailsInterface(settingsModel)),
            "/edit/:storeid/:login": page(LoginView),
            "/add": page(LoginView),
        });
    } catch (e) {
        // @TODO: nicer error could be an error page, or just show an error notification
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
