//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");

// models
const Login = require("./models/Login");
const Settings = require("./models/Settings");
// utils, libs
const helpers = require("../helpers/ui");
const { isThunderbird } = require("../helpers/base");
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

        if (isThunderbird()) {
            root.classList.add("colors-light");
            document.body.innerHTML = `
                <div class="thunderbird-popup">
                    <h3>Browserpass for Thunderbird</h3>
                    <p>In Thunderbird, Browserpass works automatically in the background:</p>
                    <p><strong>Pass store layout</strong></p>
                    <ul>
                        <li><code>thunderbird/imap-{hostname}</code> — IMAP password</li>
                        <li><code>thunderbird/smtp-{hostname}</code> — SMTP password</li>
                        <li><code>thunderbird/pop3-{hostname}</code> — POP3 password</li>
                        <li><code>thunderbird/oauth-{provider}</code> — OAuth refresh token (CalDAV/CardDAV)</li>
                        <li><code>thunderbird/https-{hostname}</code> — OAuth browser-window login credentials
                            <ul>
                                <li>Username is auto-copied to clipboard when the window opens</li>
                                <li><code>Ctrl+Shift+U</code> — re-copy username to clipboard</li>
                                <li><code>Ctrl+Shift+P</code> — copy password to clipboard</li>
                            </ul>
                        </li>
                    </ul>
                    <p><strong>Migrating existing Thunderbird credentials to pass:</strong></p>
                    <ol>
                        <li>Open <em>Add-ons Manager</em> → <em>Browserpass</em> → <em>Preferences</em></li>
                        <li>Scroll to the <em>Thunderbird</em> section and click
                            <strong>Migrate Thunderbird credentials to pass</strong></li>
                        <li>After migration succeeds, you could remove the internal copies:
                            <em>Settings → Privacy &amp; Security → Saved Passwords</em> → delete them</li>
                    </ol>
                    <hr>
                    <p class="thunderbird-popup-hint"><strong>To hide this button:</strong> Right-click the toolbar → <em>Customize</em> → drag the Browserpass button off the toolbar → <em>Save</em>.</p>
                </div>
            `;
            return;
        }

        root.classList.remove("colors-dark");
        root.classList.add(`colors-${settings.theme}`);

        /**
         * Only set width: min-content for the attached popup,
         * and allow content to fill detached window
         */
        if (!Object.prototype.hasOwnProperty.call(settings, "authRequested")) {
            root.classList.add("attached");
            document.getElementsByTagName("body")[0].classList.add("attached");
        }

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
