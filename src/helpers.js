//------------------------------------- Initialisation --------------------------------------//
"use strict";

const FuzzySort = require("fuzzysort");
const TldJS = require("tldjs");
const sha1 = require("sha1");

module.exports = {
    pathToDomain,
    prepareLogins,
    filterSortLogins
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
 * @since 3.1.0
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
    var candidates = logins.map(candidate => {
        let lastSlashIndex = candidate.login.lastIndexOf("/") + 1;
        return Object.assign(candidate, {
            path: candidate.login.substr(0, lastSlashIndex),
            display: candidate.login.substr(lastSlashIndex)
        });
    });

    var mostRecent = null;
    if (currentDomainOnly) {
        var recent = candidates.filter(function(login) {
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
            login => login.inCurrentDomain && !login.recent.count
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
        let substringFilters = filter.slice(fuzzyFirstWord ? 1 : 0).map(w => w.toLowerCase());

        // First reduce the list by running the substring search
        substringFilters.forEach(function(word) {
            candidates = candidates.filter(c => c.login.toLowerCase().indexOf(word) >= 0);
        });

        // Then run the fuzzy filter
        let fuzzyResults = {};
        if (fuzzyFilter) {
            candidates = FuzzySort.go(fuzzyFilter, candidates, {
                keys: ["login", "store.name"],
                allowTypo: false
            }).map(result => {
                fuzzyResults[result.obj.login] = result;
                return result.obj;
            });
        }

        // Finally highlight all matches
        candidates = candidates.map(c => highlightMatches(c, fuzzyResults, substringFilters));
    }

    // Prefix root entries with slash to let them have some visible path
    candidates.forEach(c => {
        c.path = c.path || "/";
    });

    return candidates;
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
        display: display
    });
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
