const m = require("mithril");
const Moment = require("moment");
const Login = require("../models/Login");
const Settings = require("../models/Settings");
const helpers = require("../../helpers");

var LoginForm = {
    settings: {},
    oninit: async function(vnode) {
        console.log("LoginForm.oninit():", vnode);
        LoginForm.settings = await Settings.get();

        // Show existing login
        if (vnode.attrs.login !== undefined) {
            await Login.load(LoginForm.settings, vnode.attrs.storeid, vnode.attrs.login);
        }
    },
    view: function(vnode) {
        console.log("LoginForm.view():", vnode);
        var nodes = [];

        return m("form", [
            m("label.label", "First Name"),
            m("label.label", "Last Name"),
        ])
    }
}

module.exports = LoginForm;

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
