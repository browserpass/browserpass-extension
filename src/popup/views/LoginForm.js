const m = require("mithril");
const Moment = require("moment");
const Login = require("../models/Login");
const helpers = require("../../helpers");

module.exports = LoginForm;

var _sets_ = {};

function LoginForm(sts) {

    _sets_ = sts;

    return function(ctl) {
        var
            editing = false,
            obj = {},
            sets = _sets_,
            stores = []
        ;

        return {
            oninit: async function(vnode, params) {
                settings = await sets.get();
                // console.log("LoginForm.oninit(), settings:", settings);

                Object.keys(settings.stores).forEach(k => {
                    stores.push(settings.stores[k])
                });

                // Show existing login
                if (vnode.attrs.login !== undefined) {
                    obj = await Login.prototype.get(settings, vnode.attrs.storeid, vnode.attrs.login);
                    // console.log("LoginForm.oninit(), login:", obj);
                    editing = true
                }

                if (editing || settings.hasOwnProperty("theme")) {
                    Login.prototype.isLogin(obj)
                    m.redraw()
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
                        m("div.btn.save"),
                    ]),
                    m("div.location", [
                        m("div.store", [
                            m(
                                "select",
                                {disabled: editing},
                                stores.map(
                                    function(store) {
                                       return m("option", {value: store.id}, store.name)
                                }),
                            ),
                            m("div.storePath", "~/.password-store/"),
                        ]),
                        m("div.path", [
                            m("input[type=text]", {
                                placeholder: "filename",
                                disabled: editing,
                                value: editing ? obj.login : "",
                            }),
                            m("div", ".gpg"),
                        ]),
                    ]),
                    m("div.contents", [
                        m("div.password", [
                            m("input[type=text]", {
                                placeholder: "password",
                                value: editing ? obj.fields.secret : "",
                            }),
                            m("div.btn.generate"),
                        ]),
                        m("div.options", [
                            m("input[type=checkbox]", {
                                id: "include_symbols",
                                checked: true,
                            }),
                            m("label", { for: "include_symbols" }, "symbols"),
                            m("input[type=number]", {
                                value: "40",
                            }),
                            m("span", "length"),
                        ]),
                        m(
                            "div.details",
                            m("textarea", {
                                placeholder: "user: johnsmith",
                                value: editing ? obj.raw : "",
                            })
                        ),
                    ]),
                )

                if (editing) {
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

/**
 * Generate a new password
 *
 * @since 3.7.0
 *
 * @param int    length   New secret length
 * @param string alphabet Allowed alphabet
 * @return string
 */
function generateSecret(
    length = 16,
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
) {
    let secret = "";
    let value = new Uint8Array(1);
    while (secret.length < length) {
        crypto.getRandomValues(value);
        if (value[0] < alphabet.length) {
            secret += alphabet[value[0]];
        }
    }
    return secret;
}
