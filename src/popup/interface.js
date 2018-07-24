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
    this.currentDomainOnly = !settings.tab.url.match(/^chrome:\/\//);
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
    var badges = Object.keys(this.settings.stores).length > 1;
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
                            var action = null;
                            if ((action = e.target.getAttribute("action"))) {
                                result.doAction(action);
                            } else {
                                result.doAction("fill");
                            }
                        },
                        onkeydown: keyHandler.bind(result)
                    },
                    [
                        badges ? m("div.store.badge", result.store.name) : null,
                        m("div.name", [
                            m.trust(result.display),
                            result.recent.when > 0
                                ? m("div.recent", {
                                      title:
                                          "Used here " +
                                          result.recent.count +
                                          " time" +
                                          (result.recent.count > 1 ? "s" : "") +
                                          ", last used " +
                                          Moment(new Date(result.recent.when)).fromNow()
                                  })
                                : null
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
 * @param string s              Search string
 * @return void
 */
function search(s) {
    var self = this;
    var fuzzyFirstWord = s.substr(0, 1) !== " ";
    s = s.trim();

    // get candidate list
    var candidates = this.logins.map(result => Object.assign(result, { display: result.login }));
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
        var filter = s.split(/\s+/);
        // fuzzy-search first word & add highlighting
        if (fuzzyFirstWord) {
            candidates = FuzzySort.go(filter[0], candidates, {
                keys: ["login", "store.name"],
                allowTypo: false
            }).map(result =>
                Object.assign(result.obj, {
                    display: result[0]
                        ? FuzzySort.highlight(result[0], "<em>", "</em>")
                        : result.obj.login
                })
            );
        }
        // substring-search to refine against each remaining word
        filter.slice(fuzzyFirstWord ? 1 : 0).forEach(function(word) {
            candidates = candidates.filter(
                login => login.login.toLowerCase().indexOf(word.toLowerCase()) >= 0
            );
        });
    }

    this.results = candidates;
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
            var targetElement = e.shiftKey ? "previousElementSibling" : "nextElementSibling";
            if (e.target[targetElement] && e.target[targetElement].hasAttribute("tabindex")) {
                e.target[targetElement].focus();
            } else if (e.shiftKey && e.target.classList.contains("login")) {
                document.querySelector(".part.search input[type=text]").focus();
            } else if (e.target.classList.contains("action")) {
                if (e.shiftKey) {
                    login.focus();
                } else if (login.nextElementSibling) {
                    login.nextElementSibling.focus();
                }
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
            this.doAction("launch");
            break;
    }
}
