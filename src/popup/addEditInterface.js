const m = require("mithril");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const Notifications = require("./notifications");
const helpers = require("../helpers");
const layout = require("./layoutInterface");

module.exports = AddEditInterface;

var persistSettingsModel = {};

function AddEditInterface(settingsModel) {
    persistSettingsModel = settingsModel;

    /**
     * AddEditView
     *
     * @since 3.X.Y
     *
     * @param object vnode  current vnode object
     */
    return function (vnode) {
        // do some basic initialization
        var editing = false,
            passwordLength = 16,
            loginObj = {},
            settings = {},
            storePath = "",
            stores = [],
            symbols = false,
            viewSettingsModel = persistSettingsModel;

        console.log("AddEditInterface.closure", vnode.state, vnode.attrs);

        return {
            oninit: async function (vnode) {
                tmpLogin = layout.getCurrentLogin();
                console.log("AddEditinterface.oninit", vnode.state, vnode.attrs, tmpLogin);
                settings = await viewSettingsModel.get();

                Object.keys(settings.stores).forEach((k) => {
                    stores.push(settings.stores[k]);
                });

                // Show existing login
                if (vnode.attrs.context.login !== undefined) {
                    if (tmpLogin !== null && tmpLogin.login == vnode.attrs.context.login) {
                        // use existing decrypted login
                        loginObj = tmpLogin;
                    } else {
                        // no match, must re-decrypt login
                        loginObj = await Login.prototype.get(
                            settings,
                            vnode.attrs.context.storeid,
                            vnode.attrs.context.login
                        );
                    }
                    editing = true;
                } else {
                    // view instance should be a Login
                    loginObj = new Login(settings);
                }

                // set the storePath
                this.setStorePath();

                // trigger redraw after retrieving details
                if (
                    (editing && Login.prototype.isLogin(loginObj)) ||
                    Settings.prototype.isSettings(settings)
                ) {
                    m.redraw();
                }
            },
            /**
             * Update login path.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {string} path
             */
            setLogin: function (path) {
                loginObj.login = path;
            },
            /**
             * Update pass length when generating secret in view.
             * Used onchange: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {int} length
             */
            setPasswordLength: function (length) {
                passwordLength = length > 0 ? length : 1;
            },
            /**
             * Update login raw text and secret when "raw text" changes.
             * Used oninput: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {string} text
             */
            setRawDetails: function (text) {
                loginObj.setRawDetails(text);
            },
            /**
             * Update login secret and raw text when "secret" changes.
             * Used oninput: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {string} secret
             */
            setSecret: function (secret) {
                loginObj.setPassword(secret);
            },
            /**
             * Update login store id.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {string} storeId
             */
            setStorePath: function (storeId) {
                if (editing) {
                    storePath = loginObj.store.path;
                } else if (Settings.prototype.isSettings(settings)) {
                    if (typeof storeId == "string") {
                        loginObj.store = settings.stores[storeId];
                    } else {
                        loginObj.store = stores[0];
                    }
                    storePath = loginObj.store.path;
                } else {
                    storePath = "~/.password-store";
                }
            },
            /**
             * Toggle checked on/off, determines if symbols
             * are used when generating a new random password.
             * Used in onchange: m.withAttr("value", ...)
             *
             * @since 3.X.Y
             *
             * @param {int} checked value 1 or 0 for checked
             */
            setSymbols: function (checked) {
                symbols = checked;
            },
            /**
             * Mithril component view
             * @param {object} vnode
             * @returns {array} children vnodes
             */
            view: function (vnode) {
                var nodes = [];
                nodes.push(
                    m("div.title", [
                        m("div.btn.back", {
                            title: "Back to list",
                            onclick: () => {
                                m.route.set("/list");
                            },
                        }),
                        m("span", editing ? "Edit credentials" : "Add credentials"),
                        Settings.prototype.canSave(settings)
                            ? m("div.btn.save", {
                                  title: "Save",
                                  onclick: async (e) => {
                                      if (!Login.prototype.isValid(loginObj)) {
                                          Notifications.errorMsg(
                                              "Please fix validation errors and try again."
                                          );
                                          e.preventDefault();
                                          return;
                                      }
                                      await Login.prototype.save(loginObj);
                                      Notifications.successMsg(
                                          m.trust(
                                              `Password entry, <strong>${loginObj.login}</strong>, has been saved to <strong>${loginObj.store.name}</strong>.`
                                          )
                                      );
                                      m.route.set("/list");
                                  },
                              })
                            : null,
                    ]),
                    m("div.location", [
                        m("div.store", [
                            m(
                                "select",
                                {
                                    disabled: editing,
                                    onchange: m.withAttr("value", this.setStorePath),
                                },
                                stores.map(function (store) {
                                    return m(
                                        "option",
                                        {
                                            value: store.id,
                                            selected: store.id == vnode.attrs.storeid,
                                        },
                                        store.name
                                    );
                                })
                            ),
                            m("div.storePath", storePath),
                        ]),
                        m("div.path", [
                            m("input[type=text]", {
                                disabled: editing,
                                placeholder: "filename",
                                value: loginObj.login,
                                oninput: m.withAttr("value", this.setLogin),
                            }),
                            m("div.suffix", ".gpg"),
                        ]),
                    ]),
                    //@TODO: Remove this block after fixing styles
                    m("div.part.details", [
                        m("div.part.snack.line-secret", [
                            m("div.label", "Secret"),
                            m(
                                "div.chars",
                                Login.prototype.isLogin(loginObj)
                                    ? helpers.highlight(loginObj.getPassword())
                                    : ""
                            ),
                        ]),
                    ]),
                    m("div.contents", [
                        m("div.password", [
                            m("label", { for: "secret" }, "Secret"),
                            m(
                                "div.chars",
                                loginObj.hasOwnProperty("fields")
                                    ? helpers.highlight(loginObj.fields.secret)
                                    : ""
                            ),
                            // m("input[type=text]", {
                            //     id: "secret",
                            //     placeholder: "password",
                            //     value: loginObj.hasOwnProperty("fields")
                            //         ? loginObj.fields.secret
                            //         : "",
                            //     // oninput: m.withAttr("value", this.setSecret),
                            // }),
                            m("div.btn.generate", {
                                onclick: () => {
                                    loginObj.setPassword(
                                        loginObj.generateSecret(passwordLength, symbols)
                                    );
                                },
                            }),
                        ]),
                        m("div.options", [
                            m("label", { for: "include_symbols" }, "Symbols"),
                            m("input[type=checkbox]", {
                                id: "include_symbols",
                                checked: symbols,
                                onchange: m.withAttr("checked", this.setSymbols),
                                value: 1,
                            }),
                            m("label", { for: "length" }, "Length"),
                            m("input[type=number]", {
                                id: "length",
                                value: passwordLength,
                                oninput: m.withAttr("value", this.setPasswordLength),
                            }),
                        ]),
                        m(
                            "div.details",
                            m("textarea", {
                                placeholder: "user: johnsmith",
                                value: loginObj.raw,
                                oninput: m.withAttr("value", this.setRawDetails),
                            })
                        ),
                    ])
                );

                if (editing && Settings.prototype.canDelete(settings)) {
                    nodes.push(
                        m(
                            "div.actions",
                            m(
                                "button.delete",
                                {
                                    onclick: async (e) => {
                                        var remove = confirm(
                                            `Are you sure you want to delete ${loginObj.login}?`
                                        );
                                        if (!remove) {
                                            e.preventDefault();
                                            return;
                                        }
                                        //@TODO: isValid or canDelete?
                                        if (!Login.prototype.isValid(loginObj)) {
                                            Notifications.errorMsg(
                                                "Error: Changes are not valid, please check and try again."
                                            );
                                            e.preventDefault();
                                            return;
                                        }
                                        await Login.prototype.delete(loginObj);
                                        Notifications.successMsg(
                                            m.trust(
                                                `Deleted password entry, <strong>${loginObj.login}</strong>, from <strong>${loginObj.store.name}</strong>.`
                                            )
                                        );
                                        m.route.set("/list");
                                    },
                                },
                                "Delete"
                            )
                        )
                    );
                }

                return m("div.addEdit", nodes);
            },
        };
    };
}
