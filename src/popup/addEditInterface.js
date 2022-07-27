const m = require("mithril");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const notify = require("./notifications");
const helpers = require("../helpers");
const layout = require("./layoutInterface");
const dialog = require("./modalDialog");

module.exports = AddEditInterface;

var persistSettingsModel = {};
const symbolsRegEx = RegExp(/[^a-z0-9]+/, "i");

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

        return {
            oninit: async function (vnode) {
                tmpLogin = layout.getCurrentLogin();
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
                    // update default password options based on current password
                    const password = loginObj.getPassword();
                    // use current password length for default length
                    if (password.length > 0) {
                        this.setPasswordLength(password.length);
                    }
                    // if has symbols, include them in options
                    if (password.search(symbolsRegEx) > -1) {
                        this.setSymbols(true);
                    }
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
                        // html alignment element makes centering title span easier
                        m("div.btn.alignment"),
                    ]),
                    m("div.location", [
                        m("div.store", [
                            m(
                                "select",
                                {
                                    disabled: editing,
                                    title: "Select which password-store to save credentials in.",
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
                                title: "File path of credentials within password-store.",
                                placeholder: "filename",
                                value: loginObj.login,
                                oninput: m.withAttr("value", this.setLogin),
                            }),
                            m("div.suffix", ".gpg"),
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
                            m("div.btn.generate", {
                                title: "Generate password",
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
                                title: "Include symbols in generated password",
                                value: 1,
                            }),
                            m("label", { for: "length" }, "Length"),
                            m("input[type=number]", {
                                id: "length",
                                title: "Length of generated password",
                                value: passwordLength,
                                oninput: m.withAttr("value", this.setPasswordLength),
                            }),
                        ]),
                        m(
                            "div.details",
                            m("textarea", {
                                placeholder: `secret

user: johnsmith`,
                                value: loginObj.raw,
                                oninput: m.withAttr("value", this.setRawDetails),
                            })
                        ),
                    ])
                );

                if (
                    Settings.prototype.canDelete(settings) ||
                    Settings.prototype.canSave(settings)
                ) {
                    nodes.push(
                        m("div.actions", [
                            Settings.prototype.canSave(settings)
                                ? m(
                                      "button.save",
                                      {
                                          title: "Save credentials",
                                          onclick: async (e) => {
                                              e.preventDefault();

                                              if (!Login.prototype.isValid(loginObj)) {
                                                  notify.errorMsg(
                                                      "Credentials are incomplete, please fix and try again."
                                                  );
                                                  return;
                                              }
                                              notify.infoMsg(
                                                  m.trust(
                                                      `Please wait, while we save: <strong>${loginObj.login}</strong>`
                                                  )
                                              );
                                              await Login.prototype.save(loginObj);
                                              notify.successMsg(
                                                  m.trust(
                                                      `Password entry, <strong>${loginObj.login}</strong>, has been saved to <strong>${loginObj.store.name}</strong>.`
                                                  )
                                              );
                                              setTimeout(window.close, 3000);
                                              m.route.set("/list");
                                          },
                                      },
                                      "Save"
                                  )
                                : null,
                            editing && Settings.prototype.canDelete(settings)
                                ? m(
                                      "button.delete",
                                      {
                                          title: "Delete credentials",
                                          onclick: (e) => {
                                              e.preventDefault();

                                              dialog.open(
                                                  `Are you sure you want to delete ${loginObj.login}?`,
                                                  async (remove) => {
                                                      if (!remove) {
                                                          return;
                                                      }

                                                      notify.warningMsg(
                                                          m.trust(
                                                              `Please wait, while we delete: <strong>${loginObj.login}</strong>`
                                                          )
                                                      );
                                                      await Login.prototype.delete(loginObj);
                                                      notify.successMsg(
                                                          m.trust(
                                                              `Deleted password entry, <strong>${loginObj.login}</strong>, from <strong>${loginObj.store.name}</strong>.`
                                                          )
                                                      );
                                                      setTimeout(window.close, 3000);
                                                      m.route.set("/list");
                                                  }
                                              );
                                          },
                                      },
                                      "Delete"
                                  )
                                : null,
                        ])
                    );
                }

                return m("div.addEdit", nodes);
            },
        };
    };
}
