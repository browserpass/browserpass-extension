"use strict";

require("chrome-extension-async");
const m = require('mithril');
const sha1 = require("sha1");
const helpers = require("../../helpers");
const Settings = require("./Settings");

function Login(settings, obj = {}) {
    if (Login.prototype.isLogin(obj)) {
        // content sha used to determine if login has changes
        this.contentSha = sha1(obj.login + sha1(obj.raw || ''));
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
    for (const prop in obj) {
        this[prop] = obj[prop];
    }

    this.settings = settings;
}

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

Login.prototype.getPassword = function() {
    if (typeof this.fields == 'object' && this.fields.hasOwnProperty("secret")) {
        return this.fields.secret;
    }
    return this.prototype.getRawPassword();
}

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
        symbols = "`~!@#$%^&*()_-+=:;<>,.?/",
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
 * Retreive store object. Can optionally return only sub path value.
 * @todo Can be inheirited perhaps? And extended/overloaded?
 *
 * @since 3.X.Y
 *
 * @param {object} obj Login object
 * @param {string} property (optional) store sub property path value to return
 */
Login.prototype.getStore = function(obj, property = "") {
    let
        settingsValue = Settings.prototype.getStore(obj.settings, property),
        store = (obj.hasOwnProperty("store")) ? obj.store : {},
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

Login.prototype.isLogin = function(obj) {
    if (typeof obj == 'undefined') {
        return false;
    }

    let results = [],
        check = Array => Array.every(Boolean)
    ;

    results.push(obj.hasOwnProperty('allowFill') && typeof obj.allowFill == 'boolean');
    results.push(obj.hasOwnProperty('login') && typeof obj.login == 'string');
    results.push(obj.hasOwnProperty('store') && typeof obj.store == 'object');
    results.push(obj.hasOwnProperty('host'));
    results.push(obj.hasOwnProperty('recent') && typeof obj.recent == 'object');
    // console.log("Login.prototype.isLogin(obj):", check(results), results, check, obj);

    return check(results);
}

Login.prototype.isPass = function(file) {
    return typeof file == 'string' && /\.gpg$/i.test(file)
}

/*
 * Validation, ready to save
 */
Login.prototype.isValid = function(obj) {
    let results = [],
    check = Array => Array.every(Boolean)
    ;

    results.push(Login.prototype.isLogin(obj));
    results.push(obj.hasOwnProperty('login') && obj.login.length > 0);
    results.push(obj.hasOwnProperty('raw') && typeof obj.raw == 'string' && obj.raw.length > 0);
    // console.log("Login.prototype.isValid() results:", check(results), results, check, obj);

    return check(results);
}

Login.prototype.save = async function(obj) {
    if (Login.prototype.isValid(obj)) {
        // Firefox requires data to be serializable,
        // this removes everything offending such as functions
        const login = JSON.parse(JSON.stringify(obj));
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

Login.prototype.setPassword = function(password = "") {
    if (typeof password != 'string') {
        console.warn(`Login password should be of type 'string', received '${typeof password}' instead.`);
        password = String(password);
    }

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
