"use strict";

require("chrome-extension-async");
const m = require('mithril');
const sha1 = require("sha1");
const helpers = require("../../helpers");
const Settings = require("./Settings");

/**
 * Login Constructor()
 *
 * @since 3.X.Y
 *
 * @param {object} settings
 * @param {object} loginObj (optional) Extend an existing
 *      login object to be backwards and forwards compatible.
 */
function Login(settings, loginObj = {}) {
    if (Login.prototype.isLogin(loginObj)) {
        // content sha used to determine if login has changes
        this.contentSha = sha1(loginObj.login + sha1(loginObj.raw || ''));
    } else {
        this.allowFill = true;
        this.fields = {};
        this.host = null;
        this.login = '';
        this.recent = {
            when: 0,
            count: 0,
        };
        // a null content sha identifies this a new entry
        this.contentSha = null;
    }

    // Set object properties
    for (const prop in loginObj) {
        this[prop] = loginObj[prop];
    }

    this.settings = settings;
    // ensure doAction works in detailInterface,
    // and any other view in which it is necessary.
    this.doAction = helpers.withLogin.bind({
        settings: settings, login: loginObj
    });
}

/**
 * Remove login entry
 *
 * @since 3.X.Y
 *
 * @param {object} loginObj Login entry to be deleted
 * @returns {object} Response or an empty object
 */
Login.prototype.delete = async function (loginObj) {
    if (Login.prototype.isValid(loginObj)) {
        // Firefox requires data to be serializable,
        // this removes everything offending such as functions
        const login = JSON.parse(JSON.stringify(loginObj));

        let response = await chrome.runtime.sendMessage({
            action: "delete", login: login
        });

        if (response.status != "ok") {
            throw new Error(response.message);
        }
        return response;
    }
    return {};
}

/**
 * Request a list of all login files and then
 * extend them with Login.prototype.
 *
 * @since 3.X.Y
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

    return logins;
}

/**
 * Request decrypted details of login from host for store id.
 *
 * @since 3.X.Y
 * @throws {error} host response errors
 *
 * @param {object} settings Settings object
 * @param {string} storeid  store id
 * @param {string} lpath    relative file path of login in store
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
 * @since 3.X.Y
 *
 * @returns {string} secret
 */
Login.prototype.getPassword = function() {
    if (typeof this.fields == 'object' && this.fields.hasOwnProperty("secret")) {
        return this.fields.secret;
    }
    return this.prototype.getRawPassword();
}

/**
 * Return only password from fields.raw
 *
 * Is used with in combination with Login.prototype.getPassword and the
 * functions: setSecret(), setRawDetails() in src/popup/addEditInterface.js
 *
 * @since 3.X.Y
 *
 * @returns {string} secret
 */
Login.prototype.getRawPassword = function() {
    if (typeof this.raw == 'string') {
        return this.raw.split("\n", 1)[0].trim();
    }
    return "";
}

/**
 * Generate a new password
 *
 * @since 3.7.0
 *
 * @param {int}     length  New secret length
 * @param {boolean} symbols Use symbols or not, default: false
 * @return string
 */
Login.prototype.generateSecret = function(
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
 * Retrieve store object. Can optionally return only sub path value.
 *
 * @since 3.X.Y
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
            break;
    }

    return value || settingsValue;
}

/**
 * Returns a boolean indication on if object passed
 * is an instance of Login.prototype.
 * @since 3.X.Y
 *
 * @param {object} login Login object
 * @returns Boolean
 */
Login.prototype.isLogin = function(login) {
    if (typeof login == 'undefined') {
        return false;
    }

    let results = [];

    results.push(Login.prototype.isPrototypeOf(login));
    results.push(login.hasOwnProperty('allowFill') && typeof login.allowFill == 'boolean');
    results.push(login.hasOwnProperty('login') && typeof login.login == 'string');
    results.push(login.hasOwnProperty('store') && typeof login.store == 'object');
    results.push(login.hasOwnProperty('host'));
    results.push(login.hasOwnProperty('recent') && typeof login.recent == 'object');

    return results.every(Boolean);
}

/**
 * Validation, determine if object passed is Login
 * and is ready to be saved.
 *
 * @since 3.X.Y
 *
 * @param {object} loginObj Login object to validated
 */
Login.prototype.isValid = function(loginObj) {
    let results = [];

    results.push(Login.prototype.isLogin(loginObj));
    results.push(loginObj.hasOwnProperty('login') && loginObj.login.length > 0);
    results.push(loginObj.hasOwnProperty('raw') && typeof loginObj.raw == 'string' && loginObj.raw.length > 0);

    return results.every(Boolean);
}

/**
 * Calls validation for Login and if it passes,
 * then calls chrome.runtime.sendMessage()
 * with {action: "add/save"} for new/existing secrets.
 *
 * @since 3.X.Y
 *
 * @param {object} loginObj Login object to be saved.
 * @returns {object} Response or an empty object.
 */
Login.prototype.save = async function(loginObj) {
    if (Login.prototype.isValid(loginObj)) {
        // Firefox requires data to be serializable,
        // this removes everything offending such as functions
        const login = JSON.parse(JSON.stringify(loginObj));
        const action = (this.contentSha == null) ? "add" : "save";

        let response = await chrome.runtime.sendMessage({
            action: action, login: login, params: { rawContents: login.raw }
        });

        if (response.status != "ok") {
            throw new Error(response.message);
        }
        return response;
    }
    return {};
}

/**
 * Sets password on Login.fields.secret and Login.raw
 *
 * @since 3.X.Y
 *
 * @param {string} password Value of password to be assgined.
 */
Login.prototype.setPassword = function(password = "") {
    let secret = this.raw || ""

    if (password.length > 0) {
        // check first line of raw text for secret
        if (secret.search(/\n\r?/) > -1) {
            secret = secret.replace(
                /^.*((?:(<?\r)\n)|(?:\n\r?))/,
                password + "$1"
            );
        } else {
            secret = password;
        }

        this.fields.secret = password;
        this.raw = secret;
    }
}

module.exports = Login;
