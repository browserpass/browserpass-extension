"use strict";

require("chrome-extension-async");
const sha1 = require("sha1");
const helpers = require("../../helpers");
const Settings = require("./Settings");

// Search for one of the secret prefixes
// from Array helpers.fieldsPrefix.secret
const
    multiLineSecretRegEx = RegExp(`^(${helpers.fieldsPrefix.secret.join("|")}): `, 'mi')
;

/**
 * Login Constructor()
 *
 * @since 3.8.0
 *
 * @param {object} settings
 * @param {object} login (optional) Extend an existing
 *      login object to be backwards and forwards compatible.
 */
function Login(settings, login = {}) {
    if (Login.prototype.isLogin(login)) {
        // content sha used to determine if login has changes, see Login.prototype.isNew
        this.contentSha = sha1(login.login + sha1(login.raw || ''));
    } else {
        this.allowFill = true;
        this.fields = {};
        this.host = null;
        this.login = '';
        this.recent = {
            when: 0,
            count: 0,
        };
        // a null content sha identifies this a new entry, see Login.prototype.isNew
        this.contentSha = null;
    }

    // Set object properties
    let setRaw = false;
    for (const prop in login) {
        this[prop] = login[prop];
        if (prop === 'raw' && login[prop].length > 0) {
            // update secretPrefix after everything else
            setRaw = true;
        }
    }

    if (setRaw) {
        this.setRawDetails(login['raw']);
    }

    this.settings = settings;
    // This ensures doAction works in detailInterface,
    // and any other view in which it is necessary.
    this.doAction = helpers.withLogin.bind({
        settings: settings, login: login
    });
}


/**
 * Determines if the login object is new or not
 *
 * @since 3.8.0
 *
 * @returns {boolean}
 */
Login.prototype.isNew = function (login) {
    return login.hasOwnProperty("contentSha") && login.contentSha === null;
}

/**
 * Remove login entry
 *
 * @since 3.8.0
 *
 * @param {object} login Login entry to be deleted
 * @returns {object} Response or an empty object
 */
Login.prototype.delete = async function (login) {
    if (Login.prototype.isValid(login)) {
        const request = helpers.deepCopy(login);

        let response = await chrome.runtime.sendMessage({
            action: "delete", login: request
        });

        if (response.status != "ok") {
            throw new Error(response.message);
        }
        return response;
    }
    return {};
}

/**
 * Generate a new password
 *
 * @since 3.8.0
 *
 * @param {int}     length  New secret length
 * @param {boolean} symbols Use symbols or not, default: false
 * @return string
 */
Login.prototype.generateSecret = function (
    length = 16,
    useSymbols = false
) {
    let
        secret = "",
        value = new Uint8Array(1),
        alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
        // double quote and backslash are at the end and escaped
        symbols = "!#$%&'()*+,-./:;<=>?@[]^_`{|}~.\"\\",
        options = ""
        ;

    options = (Boolean(useSymbols)) ? `${alphabet}${symbols}` : alphabet;

    while (secret.length < length) {
        crypto.getRandomValues(value);
        if (value[0] < options.length) {
            secret += options[value[0]];
        }
    }
    return secret;
}

/**
 * Request a list of all login files and then
 * extend them with Login.prototype.
 *
 * @since 3.8.0
 * @throws {error} host response errors
 *
 * @param {object} settings Settings object
 * @returns {array} Logins
 */
Login.prototype.getAll = async function(settings) {
    // get list of logins
    let response = await chrome.runtime.sendMessage({ action: "listFiles" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    let logins = []
    helpers.prepareLogins(response.files, settings).forEach(obj => {
        logins.push(new Login(settings, obj));
    });

    return { raw: response.files, processed: logins };
}

/**
 * Request decrypted details of login from host for store id.
 *
 * @since 3.8.0
 * @throws {error} host response errors
 *
 * @param {object} settings Settings object
 * @param {string} storeid  store id
 * @param {string} lpath    relative file path, with extension, of login in store
 * @returns Login object
 */
Login.prototype.get = async function(settings, storeid, lpath) {
    let login = helpers.prepareLogin(settings, storeid, lpath);

    var response = await chrome.runtime.sendMessage({
        action: "getDetails", login: login, params: {}
    });

    if (response.status != "ok") {
        throw new Error(response.message);
    }

    return new Login(settings, response.login);
}

/**
 * Returns fields.secret or first line from fields.raw
 *
 * See also Login.prototype.getRawPassword and the
 * functions: setSecret(), setRawDetails() in src/popup/addEditInterface.js
 *
 * @since 3.8.0
 *
 * @returns {string} secret
 */
Login.prototype.getPassword = function() {
    if (typeof this.fields == 'object' && this.fields.hasOwnProperty("secret")) {
        return this.fields.secret;
    }
    return this.getRawPassword();
}

/**
 * Return only password from fields.raw
 *
 * Is used with in combination with Login.prototype.getPassword and the
 * functions: setSecret(), setRawDetails() in src/popup/addEditInterface.js
 *
 * @since 3.8.0
 *
 * @returns {string} secret
 */
Login.prototype.getRawPassword = function() {
    if (typeof this.raw == 'string' && this.raw.length > 0) {
        const text = this.raw;

        return this.getSecretDetails(text).password;
    }
    return "";
}

/**
 * Extract secret password and prefix from raw text string
 * Private
 * @param {string} text
 * @returns {object}
 */
function getSecretDetails(text = "") {
    let results = {
        prefix: null,
        password: "",
    }

    if (typeof text == 'string' && text.length > 0) {
        let index = text.search(multiLineSecretRegEx);

        // assume first line
        if (index == -1) {
            results.password = text.split(/[\n\r]+/, 1)[0].trim();
        } else {
            const secret = text.substring(index).split(/[\n\r]+/, 1)[0].trim();
            // only take first instance of "prefix: "
            index = secret.search(": ");
            results.prefix = secret.substring(0, index);
            results.password = secret.substring(index+2);
        }
    }

    return results;
}

/**
 * Retrieve store object. Can optionally return only sub path value.
 *
 * @since 3.8.0
 *
 * @param {object} login Login object
 * @param {string} property (optional) store sub property path value to return
 */
Login.prototype.getStore = function(login, property = "") {
    let
        settingsValue = Settings.prototype.getStore(login.settings, property),
        store = (login.hasOwnProperty("store")) ? login.store : {},
        value = null
    ;

    switch (property) {
        case "color":
        case "bgColor":
            if (store.hasOwnProperty(property)) {
                value = store[property];
            }
            break;

        default:
            if (property != "" && store.hasOwnProperty(property)) {
                value = store[property];
            }
            break;
    }

    return value || settingsValue;
}

/**
 * Build style string for a login's store colors with which
 * to apply to an html element
 *
 * @since 3.8.0
 *
 * @param {object} login to pull store color settings from
 * @returns {string}
 */
Login.prototype.getStoreStyle = function (login) {
    if (!Login.prototype.isLogin(login)) {
        return "";
    }
    const color = Login.prototype.getStore(login, "color");
    const bgColor = Login.prototype.getStore(login, "bgColor");

    return `color: ${color}; background-color: ${bgColor};`
}

/**
 * Determine if secretPrefix property has been set for
 * the current Login object: "this"
 *
 * @since 3.8.0
 *
 * @returns {boolean}
 */
Login.prototype.hasSecretPrefix = function () {
    let results = [];

    results.push(this.hasOwnProperty('secretPrefix'));
    results.push(Boolean(this.secretPrefix));
    results.push(helpers.fieldsPrefix.secret.includes(this.secretPrefix));

    return results.every(Boolean);
}

/**
 * Returns a boolean indication on if object passed
 * has the minimum required login propteries,
 * Login.prototype.isPrototypeOf(login) IS NOT the goal of this.
 * @since 3.8.0
 *
 * @param {object} login Login object
 * @returns Boolean
 */
Login.prototype.isLogin = function(login) {
    if (typeof login == 'undefined') {
        return false;
    }

    let results = [];

    results.push(login.hasOwnProperty('allowFill') && typeof login.allowFill == 'boolean');
    results.push(login.hasOwnProperty('login') && typeof login.login == 'string');
    results.push(login.hasOwnProperty('store') && typeof login.store == 'object');
    results.push(login.hasOwnProperty('host'));
    results.push(login.hasOwnProperty('recent') && typeof login.recent == 'object');

    return results.every(Boolean);
}

/**
 * Validation, determine if object passed is a
 * Login.prototype and is ready to be saved.
 *
 * @since 3.8.0
 *
 * @param {object} login Login object to validated
 */
Login.prototype.isValid = function(login) {
    let results = [];

    results.push(Login.prototype.isLogin(login));
    results.push(Login.prototype.isPrototypeOf(login));
    results.push(login.hasOwnProperty('login') && login.login.length > 0);
    results.push(login.hasOwnProperty('raw') && typeof login.raw == 'string' && login.raw.length > 0);

    return results.every(Boolean);
}

/**
 * Calls validation for Login and if it passes,
 * then calls chrome.runtime.sendMessage()
 * with {action: "add/save"} for new/existing secrets.
 *
 * @since 3.8.0
 *
 * @param {object} login Login object to be saved.
 * @returns {object} Response or an empty object.
 */
Login.prototype.save = async function(login) {
    if (Login.prototype.isValid(login)) {
        const request = helpers.deepCopy(login);
        const action = (this.isNew(login)) ? "add" : "save";

        let response = await chrome.runtime.sendMessage({
            action: action, login: request, params: { rawContents: request.raw }
        });

        if (response.status != "ok") {
            throw new Error(response.message);
        }
        return response;
    }
    return {};
}

/**
 * Sets password on Login.fields.secret and Login.raw,
 * leave the secretPrefix unchanged.
 *
 * @since 3.8.0
 *
 * @param {string} password Value of password to be assigned.
 */
Login.prototype.setPassword = function(password = "") {
    // secret is either entire raw text or defaults to blank string
    let secret = this.raw || ""

    // if user has secret prefix make sure it persists
    const combined = (this.hasSecretPrefix()) ? `${this.secretPrefix}: ${password}` : password

    // check for an existing prefix + password
    const start = secret.search(multiLineSecretRegEx)
    if (start > -1) {
        // multi line, update the secret/password, not the prefix
        const remaining = secret.substring(start)
        let end = remaining.search(/[\n\r]/);
        end = (end > -1) ? end : remaining.length; // when no newline after pass

        const parts = [
            secret.substring(0, start),
            combined,
            secret.substring(start + end)
        ]
        secret = parts.join("");
    } else if (secret.length > 0) {
        // replace everything in first line except ending
        secret = secret.replace(
            /^.*((?:\n\r?))?/,
            combined + "$1"
        );
    } else {
        // when secret is already empty just set password
        secret = combined;
    }

    this.fields.secret = password;
    this.raw = secret;
}

/**
 * Update the raw text details, password, and also the secretPrefix.
 *
 * @since 3.8.0
 *
 * @param {string} text Full text details of secret to be updated
 */
Login.prototype.setRawDetails = function (text = "") {
    const results = getSecretDetails(text);

    if (results.prefix) {
        this.secretPrefix = results.prefix;
    } else {
        delete this.secretPrefix;
    }
    this.fields.secret = results.password;
    this.raw = text;
}

module.exports = Login;
