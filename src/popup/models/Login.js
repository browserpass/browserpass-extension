"use strict";

require("chrome-extension-async");
const m = require('mithril');
const helpers = require("../../helpers");
// const BrowserpassURL = require("@browserpass/url");

function Login(sets, obj) {
    if (Login.prototype.isLogin(obj)) {
        // console.log("Login() obj update this:", obj)
        for (const prop in obj) {
            this[prop] = obj[prop];
        }
    }
    this.settings = sets;
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
    let files = []
    files[storeid] = Array()
    files[storeid].push(lpath)

    let logins = helpers.prepareLogins(files, settings)

    var response = await chrome.runtime.sendMessage({
        action: "getDetails", login: logins[0], params: {}
    });

    if (response.status != "ok") {
        throw new Error(response.message);
    }

    return new Login(settings, response.login);
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

module.exports = Login;
