//------------------------------------- Initialisation --------------------------------------//
"use strict";

const FuzzySort = require("fuzzysort");
const sha1 = require("sha1");
const ignore = require("ignore");
const hash = require("hash.js");
const Authenticator = require("otplib").authenticator.Authenticator;
const BrowserpassURL = require("@browserpass/url");

module.exports = {
    prepareLogins,
    filterSortLogins,
    ignoreFiles,
    makeTOTP,
};

//----------------------------------- Function definitions ----------------------------------//

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
            const login = {
                index: index++,
                store: settings.stores[storeId],
                login: files[storeId][key].replace(/\.gpg$/i, ""),
                allowFill: true,
            };

            // extract url info from path
            let pathInfo = pathToInfo(storeId + "/" + login.login, origin);
            if (pathInfo) {
                // set assumed host
                login.host = pathInfo.port
                    ? `${pathInfo.hostname}:${pathInfo.port}`
                    : pathInfo.hostname;

                // check whether extracted path info matches the current origin
                login.inCurrentHost = origin.hostname === pathInfo.hostname;

                // check whether the current origin is subordinate to extracted path info, meaning:
                //  - that the path info is not a single level domain (e.g. com, net, local)
                //  - and that the current origin is a subdomain of that path info
                if (
                    pathInfo.hostname.includes(".") &&
                    origin.hostname.endsWith(`.${pathInfo.hostname}`)
                ) {
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

            logins.push(login);
        }
    }

    return logins;
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
    let matches = (fuzzyResults[entry.login] && fuzzyResults[entry.login][0]
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
