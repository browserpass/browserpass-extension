"use strict";

require("chrome-extension-async");
const m = require('mithril');
const helpers = require("../../helpers");

function Login(settings, obj = {}) {
    if (Login.prototype.isLogin(obj)) {
        // console.log("Login() obj update this:", obj)
        for (const prop in obj) {
            this[prop] = obj[prop];
        }
    } else {
        this.fields = {}
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
 * @param int    length   New secret length
 * @param string alphabet Allowed alphabet
 * @return string
 */
Login.prototype.generateSecret = function(
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

Login.prototype.isLogin = function(obj) {
    let results = [],
        check = Array => Array.every(Boolean)
    ;

    results.push(obj.hasOwnProperty('allowFill') && typeof obj.allowFill == 'boolean');
    results.push(obj.hasOwnProperty('login') && typeof obj.login == 'string');
    results.push(obj.hasOwnProperty('store') && typeof obj.store == 'object');
    results.push(obj.hasOwnProperty('host'));
    results.push(obj.hasOwnProperty('recent') && typeof obj.store == 'object');
    // console.log("Login.prototype.isLogin(obj):", check(results), results, check, obj);

    return check(results);
}

Login.prototype.isPass = function(file) {
    return typeof file == 'string' && /\.gpg$/i.test(file)
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
