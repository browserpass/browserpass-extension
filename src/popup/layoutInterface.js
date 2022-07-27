const m = require("mithril");
const Notifications = require("./notifications");
const dialog = require("./modalDialog");

/**
 * Page / layout wrapper component. Used to share global
 * message and ui component functionality with any child
 * compoenents.
 *
 * Can also maintain a pseudo session state.
 */

let session = {
    // current decrypted login object
    current: null,
};

/**
 * Page layout component
 * @since 3.X.Y
 */
let LayoutInterface = {
    view: function (vnode) {
        vnode.children.push(m(Notifications));
        vnode.children.push(m(dialog));

        return m(".layout", vnode.children);
    },
};

/**
 * Set login on details page after successful decrpytion
 * @since 3.X.Y
 *
 * @param {object} login set session login object
 */
function setCurrentLogin(login) {
    session.current = login;
}

/**
 * Get current login on edit page to avoid 2nd decryption request
 * @since 3.X.Y
 *
 * @returns {object} current login object
 */
function getCurrentLogin() {
    return session.current;
}

module.exports = {
    LayoutInterface,
    setCurrentLogin,
    getCurrentLogin,
};
