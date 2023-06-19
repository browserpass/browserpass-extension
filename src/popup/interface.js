module.exports = Interface;

const m = require("mithril");
const Moment = require("moment");
const SearchInterface = require("./searchinterface");
const layout = require("./layoutInterface");
const helpers = require("../helpers");
const Settings = require("./models/Settings");

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
    this.renderMainView = renderMainView;
    this.search = search;

    // fields
    this.settings = settings;
    this.logins = logins;

    this.results = [];
    // check for chromium based browsers setting tab
    this.currentDomainOnly = !settings.tab.url.match(/^(chrome|brave|edge|opera|vivaldi|about):/);
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
    const nodes = [];
    // clear last viewed login
    layout.setCurrentLogin(null);

    nodes.push(...this.renderMainView(ctl, params));

    if (this.settings.version < helpers.LATEST_NATIVE_APP_VERSION) {
        nodes.push(
            m("div.updates", [
                m("span", "Update native host app: "),
                m(
                    "a",
                    {
                        href: "https://github.com/browserpass/browserpass-native#installation",
                        target: "_blank",
                    },
                    "instructions"
                ),
            ])
        );
    }

    return nodes;
}

function renderMainView(ctl, params) {
    var nodes = [];
    nodes.push(m(this.searchPart));

    nodes.push(
        m(
            "div.logins",
            this.results.map(function (result) {
                const storeBgColor = result.store.bgColor || result.store.settings.bgColor;
                const storeColor = result.store.color || result.store.settings.color;

                return m(
                    "div.part.login",
                    {
                        onclick: function (e) {
                            var action = e.target.getAttribute("action");
                            if (action) {
                                result.doAction(action);
                            }
                        },
                        onkeydown: keyHandler.bind(result),
                        tabindex: 0,
                    },
                    [
                        m(
                            "div.name",
                            {
                                key: result.index,
                                tabindex: 0,
                                title: "Fill username / password | <Enter>",
                                onclick: function (e) {
                                    result.doAction("fill");
                                },
                                onkeydown: keyHandler.bind(result),
                            },
                            [
                                m("div.line1", [
                                    m(
                                        "div.store.badge",
                                        {
                                            style: `background-color: ${storeBgColor};
                                                color: ${storeColor}`,
                                        },
                                        result.store.name
                                    ),
                                    m("div.path", [m.trust(result.path)]),
                                    result.recent.when > 0
                                        ? m("div.recent", {
                                              title:
                                                  "Used here " +
                                                  result.recent.count +
                                                  " time" +
                                                  (result.recent.count > 1 ? "s" : "") +
                                                  ", last " +
                                                  Moment(new Date(result.recent.when)).fromNow(),
                                          })
                                        : null,
                                ]),
                                m("div.line2", [m.trust(result.display)]),
                            ]
                        ),
                        m("div.action.copy-user", {
                            tabindex: 0,
                            title: "Copy username | <Ctrl+Shift+C>",
                            action: "copyUsername",
                        }),
                        m("div.action.copy-password", {
                            tabindex: 0,
                            title: "Copy password | <Ctrl+C>",
                            action: "copyPassword",
                        }),
                        m("div.action.details", {
                            tabindex: 0,
                            title: "Open Details | <Ctrl+O>",
                            oncreate: m.route.link,
                            onupdate: m.route.link,
                            href: `/details/${result.store.id}/${encodeURIComponent(
                                result.loginPath
                            )}`,
                        }),
                    ]
                );
            })
        ),
        m(
            "div.part.add",
            {
                tabindex: 0,
                title: "Add new login | <Ctrl+A>",
                oncreate: m.route.link,
                onupdate: m.route.link,
                href: `/add`,
                onkeydown: (e) => {
                    e.preventDefault();

                    function goToElement(element) {
                        element.focus();
                        element.scrollIntoView();
                    }

                    let lastLogin = document.querySelector(".logins").lastChild;
                    let searchInput = document.querySelector(".part.search input[type=text]");
                    switch (e.code) {
                        case "Tab":
                            if (e.shiftKey) {
                                goToElement(lastLogin);
                            } else {
                                goToElement(searchInput);
                            }
                            break;
                        case "Home":
                            goToElement(searchInput);
                            break;
                        case "ArrowUp":
                            goToElement(lastLogin);
                            break;
                        case "ArrowDown":
                            goToElement(searchInput);
                            break;
                        case "Enter":
                            e.target.click();
                        case "KeyA":
                            if (e.ctrlKey) {
                                e.target.click();
                            }
                            break;
                        default:
                            break;
                    }
                },
            },
            "Add credentials"
        )
    );

    return nodes;
}

/**
 * Run a search
 *
 * @param string searchQuery Search query
 * @return void
 */
function search(searchQuery) {
    this.results = helpers.filterSortLogins(this.logins, searchQuery, this.currentDomainOnly);
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
            } else if (e.target == document.querySelector(".logins").lastChild) {
                document.querySelector(".part.add").focus();
            } else {
                document.querySelector(".part.search input[type=text]").focus();
            }
            break;
        case "ArrowDown":
            if (login.nextElementSibling) {
                login.nextElementSibling.focus();
            } else {
                document.querySelector(".part.add").focus();
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
            } else {
                e.target.click();
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
            } else if (e.target.classList.contains("details")) {
                e.target.click();
            } else {
                this.doAction("fill");
            }
            break;
        case "KeyA":
            if (e.ctrlKey) {
                document.querySelector(".part.add").click();
            }
            break;
        case "KeyC":
            if (e.ctrlKey) {
                if (e.shiftKey || document.activeElement.classList.contains("copy-user")) {
                    this.doAction("copyUsername");
                } else {
                    this.doAction("copyPassword");
                }
            }
            break;
        case "KeyG":
            if (e.ctrlKey) {
                this.doAction(e.shiftKey ? "launchInNewTab" : "launch");
            }
            break;
        case "KeyO":
            if (e.ctrlKey) {
                e.target.querySelector("div.action.details").click();
            }
            break;
        case "Home": {
            document.querySelector(".part.search input[type=text]").focus();
            document.querySelector(".logins").scrollTo(0, 0);
            window.scrollTo(0, 0);
            break;
        }
        case "End": {
            let logins = document.querySelectorAll(".login");
            if (logins.length) {
                let target = logins.item(logins.length - 1);
                target.scrollIntoView();
            }
            document.querySelector(".part.add").focus();
            break;
        }
    }
}
