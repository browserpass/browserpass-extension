module.exports = Interface;

var m = require("mithril");
var FuzzySort = require("fuzzysort");
var Moment = require("moment");
var SearchInterface = require("./searchinterface");

/**
 * Popup main interface
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @param array  logins   Array of available logins
 * @return void
 */
function Interface(settings, logins) {
    // public methods
    this.attach = attach;
    this.view = view;
    this.search = search;

    // fields
    this.settings = settings;
    this.logins = logins;
    this.results = [];
    this.currentDomainOnly = !settings.tab.url.match(/^(chrome|about):/);
    this.searchPart = new SearchInterface(this);

    // initialise with empty search
    this.search("");
}

/**
 * Attach the interface on the given element
 *
 * @since 3.0.0
 *
 * @param DOMElement element Target element
 * @return void
 */
function attach(element) {
    m.mount(element, this);
}

/**
 * Generates vnodes for render
 *
 * @since 3.0.0
 *
 * @param function ctl    Controller
 * @param object   params Runtime params
 * @return []Vnode
 */
function view(ctl, params) {
    var nodes = [];
    nodes.push(m(this.searchPart));

    nodes.push(
        m(
            "div.logins",
            this.results.map(function(result) {
                return m(
                    "div.part.login",
                    {
                        key: result.index,
                        tabindex: 0,
                        onclick: function(e) {
                            var action = e.target.getAttribute("action");
                            if (action) {
                                result.doAction(action);
                            } else {
                                result.doAction("fill");
                            }
                        },
                        onkeydown: keyHandler.bind(result)
                    },
                    [
                        m("div.name", [
                            m("div.line1", [
                                m("div.store.badge", result.store.name),
                                m("div.path", [m.trust(result.path)]),
                                result.recent.when > 0
                                    ? m("div.recent", {
                                          title:
                                              "Used here " +
                                              result.recent.count +
                                              " time" +
                                              (result.recent.count > 1 ? "s" : "") +
                                              ", last " +
                                              Moment(new Date(result.recent.when)).fromNow()
                                      })
                                    : null
                            ]),
                            m("div.line2", [m.trust(result.display)])
                        ]),
                        m("div.action.copy-password", {
                            tabindex: 0,
                            title: "Copy password",
                            action: "copyPassword"
                        }),
                        m("div.action.copy-user", {
                            tabindex: 0,
                            title: "Copy username",
                            action: "copyUsername"
                        }),
                        m("div.action.launch", {
                            tabindex: 0,
                            title: "Open URL",
                            action: "launch"
                        })
                    ]
                );
            })
        )
    );

    return nodes;
}

/**
 * Run a search
 *
 * @param string s Search string
 * @return void
 */
function search(s) {
    var self = this;
    var fuzzyFirstWord = s.substr(0, 1) !== " ";
    s = s.trim();

    // get candidate list
    var candidates = this.logins.map(candidate => {
        let lastSlashIndex = candidate.login.lastIndexOf("/") + 1;
        return Object.assign(candidate, {
            path: candidate.login.substr(0, lastSlashIndex),
            display: candidate.login.substr(lastSlashIndex)
        });
    });
    var mostRecent = null;
    if (this.currentDomainOnly) {
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
    candidates.sort(function(a, b) {
        // sort most recent first
        if (a === mostRecent) {
            return -1;
        }
        if (b === mostRecent) {
            return 1;
        }

        // sort by count
        var countDiff = b.recent.count - a.recent.count;
        if (countDiff) {
            return countDiff;
        }

        // sort alphabetically
        return a.login.localeCompare(b.login);
    });

    if (s.length) {
        let filter = s.split(/\s+/);
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

    this.results = candidates;
}

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

/**
 * Handle result key presses
 *
 * @param Event  e    Keydown event
 * @param object this Result object
 * @return void
 */
function keyHandler(e) {
    e.preventDefault();
    var login = e.target.classList.contains("login") ? e.target : e.target.closest(".login");
    switch (e.code) {
        case "Tab":
            var partElement = e.target.closest(".part");
            var targetElement = e.shiftKey ? "previousElementSibling" : "nextElementSibling";
            if (partElement[targetElement] && partElement[targetElement].hasAttribute("tabindex")) {
                partElement[targetElement].focus();
            } else {
                document.querySelector(".part.search input[type=text]").focus();
            }
            break;
        case "ArrowDown":
            if (login.nextElementSibling) {
                login.nextElementSibling.focus();
            }
            break;
        case "ArrowUp":
            if (login.previousElementSibling) {
                login.previousElementSibling.focus();
            } else {
                document.querySelector(".part.search input[type=text]").focus();
            }
            break;
        case "ArrowRight":
            if (e.target.classList.contains("login")) {
                e.target.querySelector(".action").focus();
            } else if (e.target.nextElementSibling) {
                e.target.nextElementSibling.focus();
            }
            break;
        case "ArrowLeft":
            if (e.target.previousElementSibling.classList.contains("action")) {
                e.target.previousElementSibling.focus();
            } else {
                login.focus();
            }
            break;
        case "Enter":
            if (e.target.hasAttribute("action")) {
                this.doAction(e.target.getAttribute("action"));
            } else {
                this.doAction("fill");
            }
            break;
        case "KeyC":
            if (e.ctrlKey) {
                this.doAction(e.shiftKey ? "copyUsername" : "copyPassword");
            }
            break;
        case "KeyG":
            if (e.ctrlKey) {
                this.doAction(e.shiftKey ? "launchInNewTab" : "launch");
            }
            break;
    }
}
