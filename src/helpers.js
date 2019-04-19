//------------------------------------- Initialisation --------------------------------------//
"use strict";

const TldJS = require("tldjs");
const sha1 = require("sha1");

module.exports = {
    pathToDomain,
    prepareLogins
};

//----------------------------------- Function definitions ----------------------------------//

/**
 * Get the deepest available domain component of a path
 *
 * @since 3.0.0
 *
 * @param string path        Path to parse
 * @param string currentHost Current hostname for the active tab
 * @return string|null Extracted domain
 */
function pathToDomain(path, currentHost) {
    var parts = path.split(/\//).reverse();
    for (var key in parts) {
        if (parts[key].indexOf("@") >= 0) {
            continue;
        }
        var t = TldJS.parse(parts[key]);
        if (
            t.isValid &&
            ((t.tldExists && t.domain !== null) ||
                t.hostname === currentHost ||
                currentHost.endsWith(`.${t.hostname}`))
        ) {
            return t.hostname;
        }
    }

    return null;
}

/**
 * Prepare list of logins based on provided files
 *
 * @since 3.0.16
 *
 * @param string array  List of password files
 * @param string object Settings object
 * @return array List of logins
 */
function prepareLogins(files, settings) {
    const logins = [];
    let index = 0;

    for (let storeId in files) {
        for (let key in files[storeId]) {
            // set login fields
            const login = {
                index: index++,
                store: settings.stores[storeId],
                login: files[storeId][key].replace(/\.gpg$/i, ""),
                allowFill: true
            };
            login.domain = pathToDomain(storeId + "/" + login.login, settings.host);
            login.inCurrentDomain =
                settings.host == login.domain || settings.host.endsWith("." + login.domain);
            login.recent =
                settings.recent[sha1(settings.host + sha1(login.store.id + sha1(login.login)))];
            if (!login.recent) {
                login.recent = {
                    when: 0,
                    count: 0
                };
            }

            logins.push(login);
        }
    }

    return logins;
}
