//------------------------------------- Initialisation --------------------------------------//
"use strict";

const FuzzySort = require("fuzzysort");
const sha1 = require("sha1");
const ignore = require("ignore");
const hash = require("hash.js");
const m = require("mithril");
const notify = require("./popup/notifications");
const Authenticator = require("otplib").authenticator.Authenticator;
const BrowserpassURL = require("@browserpass/url");

const fieldsPrefix = {
    secret: ["secret", "password", "pass"],
    login: ["login", "username", "user"],
    openid: ["openid"],
    otp: ["otp", "totp"],
    url: ["url", "uri", "website", "site", "link", "launch"],
};

const containsNumbersRegEx = RegExp(/[0-9]/);
const containsSymbolsRegEx = RegExp(/[\p{P}\p{S}]/, "u");
const LATEST_NATIVE_APP_VERSION = 3001000;

module.exports = {
    containsSymbolsRegEx,
    fieldsPrefix,
    LATEST_NATIVE_APP_VERSION,
    deepCopy,
    filterSortLogins,
    handleError,
    highlight,
    getSetting,
    ignoreFiles,
    makeTOTP,
    prepareLogin,
    prepareLogins,
    withLogin,
};

//----------------------------------- Function definitions ----------------------------------//

/**
 * Deep copy an object
 *
 * Firefox requires data to be serializable,
 * this removes everything offending such as functions
 *
 * @since 3.0.0 moved to helpers.js 3.8.0
 *
 * @param object obj an object to copy
 * @return object a new deep copy
 */
function deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
}

/**
 * Handle an error
 *
 * @since 3.0.0
 *
 * @param Error error Error object
 * @param string type Error type
 */
function handleError(error, type = "error") {
    switch (type) {
        case "error":
            console.log(error);
            // disable error timeout, to allow necessary user action
            notify.errorMsg(error.toString(), 0);
            break;

        case "warning":
            notify.warningMsg(error.toString());
            break;

        case "success":
            notify.successMsg(error.toString());
            break;

        case "info":
        default:
            notify.infoMsg(error.toString());
            break;
    }
}

/**
 * Do a login action
 *
 * @since 3.0.0
 *
 * @param string action Action to take
 * @param object params Action parameters
 * @return void
 */
async function withLogin(action, params = {}) {
    try {
        switch (action) {
            case "fill":
                handleError("Filling login details...", "info");
                break;
            case "launch":
                handleError("Launching URL...", "info");
                break;
            case "launchInNewTab":
                handleError("Launching URL in a new tab...", "info");
                break;
            case "copyPassword":
                handleError("Copying password to clipboard...", "info");
                break;
            case "copyUsername":
                handleError("Copying username to clipboard...", "info");
                break;
            case "copyOTP":
                handleError("Copying OTP token to clipboard...", "info");
                break;
            default:
                handleError("Please wait...", "info");
                break;
        }

        const login = deepCopy(this.login);

        // hand off action to background script
        var response = await chrome.runtime.sendMessage({ action, login, params });
        if (response.status != "ok") {
            throw new Error(response.message);
        } else {
            if (response.login && typeof response.login === "object") {
                response.login.doAction = withLogin.bind({
                    settings: this.settings,
                    login: response.login,
                });
            } else {
                window.close();
            }
        }
    } catch (e) {
        handleError(e);
    }
}

/*
 * Get most relevant setting value
 *
 * @param string key      Setting key
 * @param object login    Login object
 * @param object settings Settings object
 * @return object Setting value
 */
function getSetting(key, login, settings) {
    if (typeof login.settings[key] !== "undefined") {
        return login.settings[key];
    }
    if (typeof settings.stores[login.store.id].settings[key] !== "undefined") {
        return settings.stores[login.store.id].settings[key];
    }

    return settings[key];
}

/**
 * Get the deepest available domain component of a path
 *
 * @since 3.2.3
 *
 * @param string path        Path to parse
 * @param object currentHost Current host info for the active tab
 * @return object|null Extracted domain info
 */
function pathToInfo(path, currentHost) {
    var parts = path.split(/\//).reverse();
    for (var key in parts) {
        if (parts[key].indexOf("@") >= 0) {
            continue;
        }
        var info = BrowserpassURL.parseHost(parts[key]);

        // Part is considered to be a domain component in one of the following cases:
        // - it is a valid domain with well-known TLD (github.com, login.github.com)
        // - it is or isn't a valid domain with any TLD but the current host matches it EXACTLY (localhost, pi.hole)
        // - it is or isn't a valid domain with any TLD but the current host is its subdomain (login.pi.hole)
        if (
            info.validDomain ||
            currentHost.hostname === info.hostname ||
            currentHost.hostname.endsWith(`.${info.hostname}`)
        ) {
            return info;
        }
    }

    return null;
}

/**
 * Prepare list of logins based on provided files
 *
 * @since 3.1.0
 *
 * @param string array  List of password files
 * @param string object Settings object
 * @return array List of logins
 */
function prepareLogins(files, settings) {
    const logins = [];
    let index = 0;
    let origin = new BrowserpassURL(settings.origin);

    for (let storeId in files) {
        for (let key in files[storeId]) {
            // set login fields
            const login = prepareLogin(settings, storeId, files[storeId][key], index++, origin);

            logins.push(login);
        }
    }

    return logins;
}

/**
 * Prepare a single login based settings, storeId, and path
 *
 * @since 3.8.0
 *
 * @param string settings   Settings object
 * @param string storeId    Store ID alphanumeric ID
 * @param string file       Relative path in store to password
 * @param number index      An array index for login, if building an array of logins (optional, default: 0)
 * @param object origin     Instance of BrowserpassURL (optional, default: new BrowserpassURL(settings.origin))
 * @return object of login
 */
function prepareLogin(settings, storeId, file, index = 0, origin = undefined) {
    const login = {
        index: index > -1 ? parseInt(index) : 0,
        store: settings.stores[storeId],
        // remove the file-type extension
        login: file.replace(/\.[^.]+$/u, ""),
        loginPath: file,
        allowFill: true,
    };

    origin = BrowserpassURL.prototype.isPrototypeOf(origin)
        ? origin
        : new BrowserpassURL(settings.origin);

    // extract url info from path
    let pathInfo = pathToInfo(storeId + "/" + login.login, origin);
    if (pathInfo) {
        // set assumed host
        login.host = pathInfo.port ? `${pathInfo.hostname}:${pathInfo.port}` : pathInfo.hostname;

        // check whether extracted path info matches the current origin
        login.inCurrentHost = origin.hostname === pathInfo.hostname;

        // check whether the current origin is subordinate to extracted path info, meaning:
        //  - that the path info is not a single level domain (e.g. com, net, local)
        //  - and that the current origin is a subdomain of that path info
        if (pathInfo.hostname.includes(".") && origin.hostname.endsWith(`.${pathInfo.hostname}`)) {
            login.inCurrentHost = true;
        }

        // filter out entries with a non-matching port
        if (pathInfo.port && pathInfo.port !== origin.port) {
            login.inCurrentHost = false;
        }
    } else {
        login.host = null;
        login.inCurrentHost = false;
    }

    // update recent counter
    login.recent =
        settings.recent[sha1(settings.origin + sha1(login.store.id + sha1(login.login)))];
    if (!login.recent) {
        login.recent = {
            when: 0,
            count: 0,
        };
    }

    return login;
}

/**
 * Highlight password characters
 *
 * @since 3.8.0
 *
 * @param {string} secret a string to be split by character
 * @return {array} mithril vnodes to be rendered
 */
function highlight(secret = "") {
    return secret.split("").map((c) => {
        if (c.match(containsNumbersRegEx)) {
            return m("span.char.num", c);
        } else if (c.match(containsSymbolsRegEx)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });
}

/**
 * Filter and sort logins
 *
 * @since 3.1.0
 *
 * @param string array  List of logins
 * @param string object Settings object
 * @return array Filtered and sorted list of logins
 */
function filterSortLogins(logins, searchQuery, currentDomainOnly) {
    var fuzzyFirstWord = searchQuery.substr(0, 1) !== " ";
    searchQuery = searchQuery.trim();

    // get candidate list
    var candidates = logins.map((candidate) => {
        let lastSlashIndex = candidate.login.lastIndexOf("/") + 1;
        return Object.assign(candidate, {
            path: candidate.login.substr(0, lastSlashIndex),
            display: candidate.login.substr(lastSlashIndex),
        });
    });

    var mostRecent = null;
    if (currentDomainOnly) {
        var recent = candidates.filter(function (login) {
            if (login.recent.count > 0) {
                // find most recently used login
                if (!mostRecent || login.recent.when > mostRecent.recent.when) {
                    mostRecent = login;
                }
                return true;
            }
            return false;
        });
        var remainingInCurrentDomain = candidates.filter(
            (login) => login.inCurrentHost && !login.recent.count
        );
        candidates = recent.concat(remainingInCurrentDomain);
    }

    candidates.sort((a, b) => {
        // show most recent first
        if (a === mostRecent) {
            return -1;
        }
        if (b === mostRecent) {
            return 1;
        }

        // sort by frequency
        var countDiff = b.recent.count - a.recent.count;
        if (countDiff) {
            return countDiff;
        }

        // sort by specificity, only if filtering for one domain
        if (currentDomainOnly) {
            var domainLevelsDiff =
                (b.login.match(/\./g) || []).length - (a.login.match(/\./g) || []).length;
            if (domainLevelsDiff) {
                return domainLevelsDiff;
            }
        }

        // sort alphabetically
        return a.login.localeCompare(b.login);
    });

    if (searchQuery.length) {
        let filter = searchQuery.split(/\s+/);
        let fuzzyFilter = fuzzyFirstWord ? filter[0] : "";
        let substringFilters = filter.slice(fuzzyFirstWord ? 1 : 0).map((w) => w.toLowerCase());

        // First reduce the list by running the substring search
        substringFilters.forEach(function (word) {
            candidates = candidates.filter((c) => c.login.toLowerCase().indexOf(word) >= 0);
        });

        // Then run the fuzzy filter
        let fuzzyResults = {};
        if (fuzzyFilter) {
            candidates = FuzzySort.go(fuzzyFilter, candidates, {
                keys: ["login", "store.name"],
                allowTypo: false,
            }).map((result) => {
                fuzzyResults[result.obj.login] = result;
                return result.obj;
            });
        }

        // Finally highlight all matches
        candidates = candidates.map((c) => highlightMatches(c, fuzzyResults, substringFilters));
    }

    // Prefix root entries with slash to let them have some visible path
    candidates.forEach((c) => {
        c.path = c.path || "/";
    });

    return candidates;
}

/**
 * Generate TOTP token
 *
 * @since 3.6.0
 *
 * @param object params OTP generation params
 * @return string Generated OTP code
 */
function makeTOTP(params) {
    switch (params.algorithm) {
        case "sha1":
        case "sha256":
        case "sha512":
            break;
        default:
            throw new Error(`Unsupported TOTP algorithm: ${params.algorithm}`);
    }

    var generator = new Authenticator();
    generator.options = {
        crypto: {
            createHmac: (a, k) => hash.hmac(hash[a], k),
        },
        algorithm: params.algorithm,
        digits: params.digits,
        step: params.period,
    };

    return generator.generate(params.secret);
}

//----------------------------------- Private functions ----------------------------------//

/**
 * Highlight filter matches
 *
 * @since 3.0.0
 *
 * @param object entry password entry
 * @param object fuzzyResults positions of fuzzy filter matches
 * @param array substringFilters list of substring filters applied
 * @return object entry with highlighted matches
 */
function highlightMatches(entry, fuzzyResults, substringFilters) {
    // Add all positions of the fuzzy search to the array
    let matches = (
        fuzzyResults[entry.login] && fuzzyResults[entry.login][0]
            ? fuzzyResults[entry.login][0].indexes
            : []
    ).slice();

    // Add all positions of substring searches to the array
    let login = entry.login.toLowerCase();
    for (let word of substringFilters) {
        let startIndex = login.indexOf(word);
        for (let i = 0; i < word.length; i++) {
            matches.push(startIndex + i);
        }
    }

    // Prepare the final array of matches before
    matches = sortUnique(matches, (a, b) => a - b);

    const OPEN = "<em>";
    const CLOSE = "</em>";
    let highlighted = "";
    var matchesIndex = 0;
    var opened = false;
    for (var i = 0; i < entry.login.length; ++i) {
        var char = entry.login[i];

        if (i == entry.path.length) {
            if (opened) {
                highlighted += CLOSE;
            }
            var path = highlighted;
            highlighted = "";
            if (opened) {
                highlighted += OPEN;
            }
        }

        if (matches[matchesIndex] === i) {
            matchesIndex++;
            if (!opened) {
                opened = true;
                highlighted += OPEN;
            }
        } else {
            if (opened) {
                opened = false;
                highlighted += CLOSE;
            }
        }
        highlighted += char;
    }
    if (opened) {
        opened = false;
        highlighted += CLOSE;
    }
    let display = highlighted;

    return Object.assign(entry, {
        path: path,
        display: display,
    });
}

/**
 * Filter out ignored files according to .browserpass.json rules
 *
 * @since 3.2.0
 *
 * @param object files    Arrays of files, grouped by store
 * @param object settings Settings object
 * @return object Filtered arrays of files, grouped by store
 */
function ignoreFiles(files, settings) {
    let filteredFiles = {};
    for (let store in files) {
        let storeSettings = settings.stores[store].settings;
        if (storeSettings.hasOwnProperty("ignore")) {
            if (typeof storeSettings.ignore === "string") {
                storeSettings.ignore = [storeSettings.ignore];
            }
            filteredFiles[store] = ignore().add(storeSettings.ignore).filter(files[store]);
        } else {
            filteredFiles[store] = files[store];
        }
    }
    return filteredFiles;
}

/**
 * Sort and remove duplicates
 *
 * @since 3.0.0
 *
 * @param array array items to sort
 * @param function comparator sort comparator
 * @return array sorted items without duplicates
 */
function sortUnique(array, comparator) {
    return array
        .sort(comparator)
        .filter((elem, index, arr) => index == !arr.length || arr[index - 1] != elem);
}
