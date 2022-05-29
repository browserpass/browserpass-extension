module.exports = DetailsInterface;

const m = require("mithril");
const Moment = require("moment");
const helpers = require("../helpers");
const Login = require("./models/Login");
const Settings = require("./models/Settings");

var persistSettingsModel = {};

/**
 * Login details interface
 *
 * @since 3.X.Y
 *
 * @param object settings   Settings object
 * @param array  login      Target login object
 * @return function         View component
 */
function DetailsInterface(settingsModel) {
    persistSettingsModel = settingsModel;

    /**
     * DetailsView
     */
    return function (ctl) {
        // set default state
        var settings = {},
            obj = new Login(persistSettingsModel, {
                basename: "",
                dirname: "",
                store: {},
                settings: settings,
            }),
            progress = null,
            viewSettingsModel = persistSettingsModel;
        return {
            // public methods
            /**
             * Initialize compoenent: get settings and login
             *
             * @since 3.X.Y
             *
             * @param {function}    vnode current vnode instance
             * @param {object}      params Runtime params
             */
            oninit: async function (vnode, params) {
                settings = await viewSettingsModel.get();

                obj = await Login.prototype.get(settings, vnode.attrs.storeid, vnode.attrs.login);

                // get basename & dirname of entry
                obj.basename = obj.login.substr(obj.login.lastIndexOf("/") + 1);
                obj.dirname = obj.login.substr(0, obj.login.lastIndexOf("/")) + "/";

                // trigger redraw after retrieving details
                m.redraw();
            },
            /**
             * Generates vnodes for render
             *
             * @since 3.6.0
             *
             * @param function ctl    Controller
             * @param object   params Runtime params
             * @return []Vnode
             */
            view: function (ctl, params) {
                const login = obj;
                const storeBgColor = Login.prototype.getStore(obj, "bgColor");
                const storeColor = Login.prototype.getStore(obj, "color");
                const secret = (obj.hasOwnProperty("fields") ? obj.fields.secret : null) || "";
                const passChars = secret.split("").map((c) => {
                    if (c.match(/[0-9]/)) {
                        return m("span.char.num", c);
                    } else if (c.match(/[^\w\s]/)) {
                        return m("span.char.punct", c);
                    }
                    return m("span.char", c);
                });

                var nodes = [];
                nodes.push(
                    m("div.title", [
                        m("div.btn.back", {
                            title: "Back to list",
                            onclick: () => {
                                m.route.set("/list");
                            },
                        }),
                        m("span", "View credentials"),
                        Settings.prototype.canSave(settings)
                            ? m("div.btn.edit", {
                                  title: `Edit ${login.basename}`,
                                  oncreate: m.route.link,
                                  href: `/edit/${obj.store.id}/${encodeURIComponent(obj.login)}`,
                              })
                            : null,
                    ]),
                    m("div.part.login.details-header", [
                        m("div.name", [
                            m("div.line1", [
                                m(
                                    "div.store.badge",
                                    {
                                        style: `background-color: ${storeBgColor};
                                               color: ${storeColor}`,
                                    },
                                    login.store.name
                                ),
                                m("div.path", [m.trust(login.dirname)]),
                                login.recent.when > 0
                                    ? m("div.recent", {
                                          title:
                                              "Used here " +
                                              login.recent.count +
                                              " time" +
                                              (login.recent.count > 1 ? "s" : "") +
                                              ", last " +
                                              Moment(new Date(login.recent.when)).fromNow(),
                                      })
                                    : null,
                            ]),
                            m("div.line2", [m.trust(login.basename)]),
                        ]),
                    ]),
                    m("div.part.details", [
                        m("div.part.snack.line-secret", [
                            m("div.label", "Secret"),
                            m("div.chars", passChars),
                            m("div.action.copy", { onclick: () => login.doAction("copyPassword") }),
                        ]),
                        m("div.part.snack.line-login", [
                            m("div.label", "Login"),
                            m("div", login.hasOwnProperty("fields") ? login.fields.login : ""),
                            m("div.action.copy", { onclick: () => login.doAction("copyUsername") }),
                        ]),
                        (() => {
                            if (
                                Settings.prototype.isSettings(settings) &&
                                settings.enableOTP &&
                                login.fields.otp &&
                                login.fields.otp.params.type === "totp"
                            ) {
                                // update progress
                                // let progress = progress;
                                let updateProgress = (vnode) => {
                                    let period = login.fields.otp.params.period;
                                    let remaining = period - ((Date.now() / 1000) % period);
                                    vnode.dom.style.transition = "none";
                                    vnode.dom.style.width = `${(remaining / period) * 100}%`;
                                    setTimeout(function () {
                                        vnode.dom.style.transition = `width linear ${remaining}s`;
                                        vnode.dom.style.width = "0%";
                                    }, 100);
                                    setTimeout(function () {
                                        m.redraw();
                                    }, remaining);
                                };
                                let progressNode = m("div.progress", {
                                    oncreate: updateProgress,
                                    onupdate: updateProgress,
                                });

                                // display otp snack
                                return m("div.part.snack.line-otp", [
                                    m("div.label", "Token"),
                                    m("div.progress-container", progressNode),
                                    m("div", helpers.makeTOTP(login.fields.otp.params)),
                                    m("div.action.copy", {
                                        onclick: () => login.doAction("copyOTP"),
                                    }),
                                ]);
                            }
                        })(),
                        m(
                            "div.part.raw",
                            m(
                                "textarea",
                                {
                                    disabled: true, // disable edit here
                                },
                                (login.raw || "").trim()
                            )
                        ),
                    ])
                );

                return m("div.details", nodes);
            },
        };
    };
}
