module.exports = DetailsInterface;

const m = require("mithril");
const helpers = require("../helpers");

/**
 * Login details interface
 *
 * @since 3.6.0
 *
 * @param object settings Settings object
 * @param array  login    Target login object
 * @return void
 */
function DetailsInterface(settings, login) {
    // public methods
    this.attach = attach;
    this.view = view;

    //fields
    this.settings = settings;
    this.login = login;
}

/**
 * Attach the interface on the given element
 *
 * @since 3.6.0
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
 * @since 3.6.0
 *
 * @param function ctl    Controller
 * @param object   params Runtime params
 * @return []Vnode
 */
function view(ctl, params) {
    const login = this.login;
    const storeBgColor = login.store.bgColor || login.store.settings.bgColor;
    const storeColor = login.store.color || login.store.settings.color;
    const passChars = login.fields.secret.split("").map(c => {
        if (c.match(/[0-9]/)) {
            return m("span.char.num", c);
        } else if (c.match(/[^\w\s]/)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });

    var nodes = [];
    nodes.push(
        m("div.part.details", [
            m("div.part.header", [
                m(
                    "div.store.badge",
                    {
                        style: `background-color: ${storeBgColor};
                                                    color: ${storeColor}`
                    },
                    login.store.name
                ),
                m("div.entry", [m("div.path", login.path), m("div.display", login.display)])
            ]),
            m("div.part.snack.line-secret", [
                m("div.label", "Secret"),
                m("div.chars", passChars),
                m("div.action.copy", { onclick: () => login.doAction("copyPassword") })
            ]),
            m("div.part.snack.line-login", [
                m("div.label", "Login"),
                m("div", login.fields.login),
                m("div.action.copy", { onclick: () => login.doAction("copyUsername") })
            ]),
            (() => {
                if (this.settings.enableOTP && login.fields.otp) {
                    // update progress
                    let progress = this.progress;
                    let updateProgress = vnode => {
                        let period = login.fields.otp.params.period;
                        let remaining = period - ((Date.now() / 1000) % period);
                        console.log(remaining, period);
                        vnode.dom.style.transition = "none";
                        vnode.dom.style.width = `${(remaining / period) * 100}%`;
                        setTimeout(function() {
                            vnode.dom.style.transition = `width linear ${remaining}s`;
                            vnode.dom.style.width = "0%";
                        }, 100);
                        setTimeout(function() {
                            m.redraw();
                        }, remaining);
                    };
                    let progressNode = m("div.progress", {
                        oncreate: updateProgress,
                        onupdate: updateProgress
                    });

                    // display otp snack
                    return m("div.part.snack.line-otp", [
                        m("div.label", "Token"),
                        m("div.progress-container", progressNode),
                        m("div", helpers.makeTOTP(login.fields.otp.params)),
                        m("div.action.copy", { onclick: () => login.doAction("copyOTP") })
                    ]);
                }
            })(),
            m("div.part.raw", m("textarea", login.raw.trim()))
        ])
    );

    return nodes;
}
