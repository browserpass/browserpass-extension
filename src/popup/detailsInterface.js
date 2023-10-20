module.exports = DetailsInterface;

const m = require("mithril");
const Moment = require("moment");
const helpers = require("../helpers");
const layout = require("./layoutInterface");
const Login = require("./models/Login");
const Settings = require("./models/Settings");
const notify = require("./notifications");

var persistSettingsModel = {};

/**
 * Login details interface
 *
 * @since 3.8.0
 *
 * @param object settings   Settings model object
 * @return function         View component
 */
function DetailsInterface(settingsModel) {
    persistSettingsModel = settingsModel;

    /**
     * DetailsView
     *
     * @since 3.8.0
     *
     * @param object vnode  current vnode object
     */
    return function (vnode) {
        // set default state
        var settings = {},
            loading = true,
            loginObj = new Login(persistSettingsModel, {
                basename: "",
                dirname: "",
                store: {},
                settings: settings,
            }),
            viewSettingsModel = persistSettingsModel;

        return {
            // public methods
            /**
             * Initialize component: get settings and login
             *
             * @since 3.8.0
             *
             * @param object    vnode current vnode instance
             */
            oninit: async function (vnode) {
                settings = await viewSettingsModel.get();
                try {
                    let tmpLogin = layout.getCurrentLogin();
                    if (
                        tmpLogin != null &&
                        Login.prototype.isLogin(tmpLogin) &&
                        tmpLogin.store.id == vnode.attrs.context.storeid &&
                        tmpLogin.login == vnode.attrs.context.login
                    ) {
                        // when returning from edit page
                        loginObj = tmpLogin;
                    } else {
                        loginObj = await Login.prototype.get(
                            settings,
                            vnode.attrs.context.storeid,
                            vnode.attrs.context.login
                        );
                    }
                } catch (error) {
                    console.log(error);
                    notify.errorMsg(error.toString(), 0);
                    m.route.set("/list");
                }

                // get basename & dirname of entry
                loginObj.basename = loginObj.login.substr(loginObj.login.lastIndexOf("/") + 1);
                loginObj.dirname = loginObj.login.substr(0, loginObj.login.lastIndexOf("/")) + "/";

                // trigger redraw after retrieving details
                layout.setCurrentLogin(loginObj);
                loading = false;
                m.redraw();
            },
            /**
             * Generates vnodes for render
             *
             * @since 3.6.0
             *
             * @param object vnode
             * @return []Vnode
             */
            view: function (vnode) {
                const login = loginObj;
                const storeBgColor = Login.prototype.getStore(loginObj, "bgColor");
                const storeColor = Login.prototype.getStore(loginObj, "color");
                const secret =
                    (loginObj.hasOwnProperty("fields") ? loginObj.fields.secret : null) || "";
                const passChars = helpers.highlight(secret);

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
                        m("div.btn.edit", {
                            title: `Edit ${login.basename}`,
                            oncreate: m.route.link,
                            href: `/edit/${loginObj.store.id}/${encodeURIComponent(
                                loginObj.login
                            )}`,
                        }),
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
                            m("div.action.copy", {
                                title: "Copy Password",
                                onclick: () => login.doAction("copyPassword"),
                            }),
                        ]),
                        m("div.part.snack.line-login", [
                            m("div.label", "Login"),
                            m("div", login.hasOwnProperty("fields") ? login.fields.login : ""),
                            m("div.action.copy", {
                                title: "Copy Username",
                                onclick: () => login.doAction("copyUsername"),
                            }),
                        ]),
                        (() => {
                            if (
                                Settings.prototype.isSettings(settings) &&
                                Login.prototype.getStore(login, "enableOTP") &&
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
                                        title: "Copy OTP",
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
                                    disabled: true,
                                },
                                login.raw || ""
                            )
                        ),
                    ])
                );

                return m(
                    "div.details",
                    loading ? m(".loading", m("p", "Loading please wait ...")) : nodes
                );
            },
        };
    };
}
