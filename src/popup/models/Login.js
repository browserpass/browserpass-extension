"use strict";

require("chrome-extension-async");
const m = require('mithril');
const helpers = require("../../helpers");

function LoginNew(settings) {
    this.settings = settings;
}

LoginNew.prototype.getAll = async function() {
    // get list of logins
    let response = await chrome.runtime.sendMessage({ action: "listFiles" });
    if (response.status != "ok") {
        throw new Error(response.message);
    }

    let logins = helpers.prepareLogins(response.files, this.settings);
    return logins;
}

LoginNew.prototype.get = async function (storeid, lpath) {
    let files = []
    files[storeid] = Array()
    files[storeid].push(lpath)

    let logins = helpers.prepareLogins(files, this.settings)

    //TODO: action: getDetails, preparedLogin, {}
    var response = await chrome.runtime.sendMessage({
        action: "getDetails", login: logins[0], params: {}
    });

    if (response.status != "ok") {
        throw new Error(response.message);
    }
    return response.login;
}

var Login = {
    loadList: async function(settings) {
        // get list of logins
        let response = await chrome.runtime.sendMessage({ action: "listFiles" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }

        let logins = helpers.prepareLogins(response.files, settings);
        return logins;
    },

    load: async function(settings, storeid, lpath) {
        let files = []
        files[storeid] = Array()
        files[storeid].push(lpath)

        let logins = helpers.prepareLogins(files, settings)

        //TODO: action: getDetails, preparedLogin, {}
        var response = await chrome.runtime.sendMessage({
            action:"getDetails", login: logins[0], params: {}
        });

        if (response.status != "ok") {
            throw new Error(response.message);
        }
        return response.login;
    }
}

module.exports = Login
