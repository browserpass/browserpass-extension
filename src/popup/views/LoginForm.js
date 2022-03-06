const m = require("mithril");
const Login = require("../models/Login");
const Settings = require("../models/Settings");
const helpers = require("../../helpers");

module.exports = LoginForm;

var persistSettingsModel = {};

function LoginForm(settingsModel) {

    persistSettingsModel = settingsModel;

    return function(ctl) {

        // do some basic initialization
        var
            editing = false,
            passwordLength = 16,
            obj = {},
            settings = {},
            storePath = "",
            stores = [],
            viewSettingsModel = persistSettingsModel
        ;

        return {
            oninit: async function(vnode, params) {
                settings = await viewSettingsModel.get();
                // console.log("LoginForm.init(vnode) settings:", settings)

                Object.keys(settings.stores).forEach(k => {
                    stores.push(settings.stores[k])
                });

                // Show existing login
                if (vnode.attrs.login !== undefined) {
                    obj = await Login.prototype.get(settings, vnode.attrs.storeid, vnode.attrs.login);
                    editing = true
                } else {
                    // view instance should be a Login
                    obj = new Login(settings);
                }
                // console.log("LoginForm.init(vnode) login:", obj);

                // set the storePath
                this.setStorePath();

                // trigger redraw after retrieving details
                if (editing && Login.prototype.isLogin(obj) || Settings.prototype.isSettings(settings)) {
                    m.redraw();
                }
            },
            setLogin: function(path) {
                obj.login = path;
            },
            setPasswordLength: function(length) {
                passwordLength = length;
            },
            setRawDetails: function(text) {
                obj.raw = text;
                obj.fields.secret = obj.getRawPassword();
            },
            setSecret: function(secret) {
                obj.setPassword(secret);
            },
            setStorePath: function(storeId) {
                if (editing) {
                    storePath = obj.store.path;
                } else if (Settings.prototype.isSettings(settings)) {
                    if (typeof storeId == "string") {
                        obj.store = settings.stores[storeId]
                    } else {
                        obj.store = stores[0]
                    }
                    storePath = obj.store.path;
                } else {
                    storePath = "~/.password-store";
                }
            },
            view: function(vnode) {
                var
                    nodes = []
                ;

                nodes.push(
                    m("div.title", [
                        m("div.btn.back", {
                            onclick: (e) => {
                                m.route.set('/list')
                            },
                        }),
                        m("span", editing ? "Edit credentials" : "Add credentials"),
                        (Settings.prototype.canSave(settings)
                            ? m("div.btn.save", {
                                onclick: async (e) => {
                                    if (!Login.prototype.isValid(obj)) {
                                        e.preventDefault();
                                        return;
                                    }
                                    await Login.prototype.save(obj);
                                    m.route.set('/list');
                                }
                            })
                            : null),
                    ]),
                    m("div.location", [
                        m("div.store", [
                            m(
                                "select",
                                {disabled: editing, onchange: m.withAttr("value", this.setStorePath)},
                                stores.map(
                                    function(store) {
                                       return m("option", {
                                           value: store.id,
                                           selected: store.id == vnode.attrs.storeid
                                        }, store.name)
                                }),
                            ),
                            m("div.storePath", storePath),
                        ]),
                        m("div.path", [
                            m("input[type=text]", {
                                placeholder: "filename",
                                value: obj.login,
                                oninput: m.withAttr("value", this.setLogin)
                            }),
                            m("div", ".gpg"),
                        ]),
                    ]),
                    m("div.contents", [
                        m("div.password", [
                            m("input[type=text]", {
                                placeholder: "password",
                                value: obj.hasOwnProperty("fields") ? obj.fields.secret : "",
                                oninput: m.withAttr("value", this.setSecret)
                            }),
                            m("div.btn.generate", {
                                onclick: () => {
                                    obj.setPassword(obj.generateSecret(passwordLength));
                                }
                            }),
                        ]),
                        m("div.options", [
                            m("input[type=checkbox]", {
                                id: "include_symbols",
                                checked: true,
                            }),
                            m("label", { for: "include_symbols" }, "symbols"),
                            m("input[type=number]", {
                                value: passwordLength,
                                oninput: m.withAttr("value", this.setPasswordLength)
                            }),
                            m("span", "length"),
                        ]),
                        m("div.details", m("textarea", {
                            placeholder: "user: johnsmith",
                            value: obj.raw,
                            oninput: m.withAttr("value", this.setRawDetails)
                        }))
                    ]),
                )

                if (editing && Settings.prototype.canDelete(settings)) {
                    nodes.push(m("div.actions", m("button.delete", "Delete")));
                }

                return m("div.addEdit", nodes);
            }
        }
    }
}

/**
 * Generate a highlighted version of the password for display
 *
 * @since 3.7.0
 *
 * @return []Vnode
 */
function passChars() {
    return this.secret.split("").map((c) => {
        if (c.match(/[0-9]/)) {
            return m("span.char.num", c);
        } else if (c.match(/[^\w\s]/)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });
}
