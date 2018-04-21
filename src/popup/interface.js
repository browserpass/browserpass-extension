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
                            result.doAction("fill");
                        },
                        onkeydown: function(e) {
                            e.preventDefault();
                            switch (e.code) {
                                case "ArrowDown":
                                    if (e.target.nextSibling) {
                                        e.target.nextSibling.focus();
                                    }
                                    break;
                                case "ArrowUp":
                                    if (e.target.previousSibling) {
                                        e.target.previousSibling.focus();
                                    } else {
                                        document
                                            .querySelector(".part.search input[type=text]")
                                            .focus();
                                    }
                                    break;
                                case "Enter":
                                    result.doAction("fill");
                                    break;
                                case "KeyC":
                                    if (e.ctrlKey) {
                                        result.doAction(
                                            e.shiftKey ? "copyUsername" : "copyPassword"
                                        );
                                    }
                                    break;
                                case "KeyG":
                                    result.doAction("launch");
                                    break;
                            }
                        }
                    },
                    [
                        badges ? m("div.store.badge", result.store.name) : null,
                        m("div.name", [
                            m.trust(result.display),
                            result.recent.when > 0
                                ? m("div.recent", {
                                      title:
                                          "Used here: " +
                                          result.recent.count +
                                          " time" +
                                          (result.recent.count > 1 ? "s" : "") +
                                          ", last " +
                                          Moment(new Date(result.recent.when)).calendar()
                                  })
                                : null
                        ]),
                        m("div.action.copy-password", {
                            title: "Copy password",
                            onclick: function(e) {
                                e.stopPropagation();
                                result.doAction("copyPassword");
                            }
                        }),
                        m("div.action.copy-user", {
                            title: "Copy username",
                            onclick: function(e) {
                                e.stopPropagation();
                                result.doAction("copyUsername");
                            }
                        }),
                        m("div.action.launch", {
                            title: "Open URL",
                            onclick: function(e) {
                                e.stopPropagation();
                                result.doAction("launch");
                            }
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
    if (this.currentDomainOnly) {
        var recent = candidates.filter(login => login.recent.count > 0);
        recent.sort(function(a, b) {
            if (a.store.when != b.store.when) {
                return b.store.when - a.store.when;
            }
            return b.recent.count - a.recent.count;
        });
        candidates = recent.concat(
            candidates.filter(login => login.inCurrentDomain && recent.indexOf(login) == -1)
        );
    }

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
