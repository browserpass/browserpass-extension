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
    // login file list
    logins: [],
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
 * Respond with boolean if combination of store id and login currently exist.
 *
 * @since 3.8.0
 *
 * @param {string} storeId unique store id
 * @param {string} login relative file path without file extension
 * @returns {boolean}
 */
function storeIncludesLogin(storeId, login) {
    if (!session.logins[storeId]) {
        return false;
    }

    if (!session.logins[storeId].length) {
        return false;
    }

    search = `${login.trim().trimLeft("/")}.gpg`;
    return session.logins[storeId].includes(search);
}

/**
 * Set session object containing list of password files.
 *
 * @since 3.8.0
 *
 * @param {object} logins raw untouched object with store id
 * as keys each an array containing list of files for respective
 * password store.
 */
function setStoreLogins(logins = {}) {
    if (Object.prototype.isPrototypeOf(logins)) {
        session.logins = logins;
    }
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
    getCurrentLogin,
    getSessionSettings,
    getStoreTree,
    setCurrentLogin,
    setStoreLogins,
    setSessionSettings,
    storeIncludesLogin,
};
