"use strict";

require("chrome-extension-async");
const m = require('mithril');
const helpers = require("../../helpers");

var Login = {
    settings: {},

    list: [],
    loadList: async function(settings) {
        // get list of logins
        let response = await chrome.runtime.sendMessage({ action: "listFiles" });
        if (response.status != "ok") {
            throw new Error(response.message);
        }
        console.log("Login.loadList: response.files", response.files)

        let logins = helpers.prepareLogins(response.files, settings);
        console.log("Login.loadList: logins", logins)
        Login.list = logins;
    },

    current: {},
    load: async function(settings, storeid, lpath) {
        console.log("Login.load():", storeid, lpath, settings);

        let files = []
        files[storeid] = Array()
        files[storeid].push(lpath)

        console.log("Login.load() files:", files)
        let logins = helpers.prepareLogins(files, settings)

        //TODO: action: getDetails, preparedLogin, {}
        var response = await chrome.runtime.sendMessage({
            action:"getDetails", login: logins[0], params: {}
        });

        console.log("Login.load() response:", response)
        if (response.status != "ok") {
            throw new Error(response.message);
        }
        Login.current = response.login;
    }
}

module.exports = Login
