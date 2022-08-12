// libs
const m = require("mithril");
// components
const dialog = require("./modalDialog");
const Notifications = require("./notifications");
// models
const Settings = require("./models/Settings");
const Tree = require("./models/Tree");

/**
 * Page / layout wrapper component. Used to share global
 * message and ui component functionality with any child
 * compoenents.
 *
 * Also maintain a pseudo session state.
 */

let session = {
    // current decrypted login object
    current: null,
    // settings
    settings: null,
    // Tree instances with storeId as key
    trees: null,
};

/**
 * Page layout component
 * @since 3.8.0
 */
let LayoutInterface = {
    oncreate: async function (vnode) {
        if (
            Settings.prototype.isSettings(session.settings) &&
            Settings.prototype.canTree(session.settings)
        ) {
            session.trees = await Tree.prototype.getAll(session.settings);
        }
    },
    view: function (vnode) {
        vnode.children.push(m(Notifications));
        vnode.children.push(m(dialog));

        return m(".layout", vnode.children);
    },
};

/**
 * Set login on details page after successful decrpytion
 * @since 3.8.0
 *
 * @param {object} login set session login object
 */
function setCurrentLogin(login) {
    session.current = login;
}

/**
 * Get current login on edit page to avoid 2nd decryption request
 * @since 3.8.0
 *
 * @returns {object} current login object
 */
function getCurrentLogin() {
    return session.current;
}

/**
 * Store a single settings object for the current session
 * @since 3.8.0
 *
 * @param {object} settings settings object
 */
function setSessionSettings(settings) {
    if (Settings.prototype.isSettings(settings)) {
        session.settings = settings;
    }
}

/**
 * Get settings object for the current session
 * @since 3.8.0
 *
 * @returns {object} settings object
 */
function getSessionSettings() {
    return session.settings;
}

function getStoreTree(storeId) {
    return session.trees[storeId];
}

module.exports = {
    LayoutInterface,
    setCurrentLogin,
    getCurrentLogin,
    setSessionSettings,
    getSessionSettings,
    getStoreTree,
};
