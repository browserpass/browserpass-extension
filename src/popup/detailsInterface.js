module.exports = DetailsInterface;

const m = require("mithril");
const Moment = require("moment");
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
    this.secret = login.fields.secret;
    this.editing = false;

    // raw data
    this.rawText = m("textarea", { readonly: true }, login.raw.trim());

    // get basename & dirname of entry
    this.login.basename = this.login.login.substr(this.login.login.lastIndexOf("/") + 1);
    this.login.dirname = this.login.login.substr(0, this.login.login.lastIndexOf("/")) + "/";
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
 * Generate a highlighted version of the password for display
 *
 * @since 3.7.0
 *
 * @return []Vnode
 */
function passChars() {
    return this.secret.split("").map((c) => {
        if (c.match(/[0-9]/)) {
            return m("span.char.num", c);
        } else if (c.match(/[^\w\s]/)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });
}

/**
 * Generate a new password
 *
 * @since 3.7.0
 *
 * @param int    length   New secret length
 * @param string alphabet Allowed alphabet
 * @return string
 */
function generateSecret(
    length = 16,
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890"
) {
    let secret = "";
    let value = new Uint8Array(1);
    while (secret.length < length) {
        crypto.getRandomValues(value);
        if (value[0] < alphabet.length) {
            secret += alphabet[value[0]];
        }
    }
    return secret;
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
    const self = this;
    const login = this.login;
    const storeBgColor = login.store.bgColor || login.store.settings.bgColor;
    const storeColor = login.store.color || login.store.settings.color;

    var nodes = [];
    nodes.push(
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
            this.editing && this.settings.caps.delete
                ? m("div.action.delete", {
                      tabindex: 0,
                      title: "Delete",
                      onclick: () => login.doAction("delete"),
                  })
                : null,
            this.editing
                ? m("div.action.save", {
                      tabindex: 0,
                      title: "Save",
                      onclick: () =>
                          login.doAction("save", { rawContents: this.rawText.dom.value }),
                  })
                : null,
            !this.editing && this.settings.caps.save
                ? m("div.action.edit", {
                      tabindex: 0,
                      title: "Edit",
                      onclick: () => {
                          this.editing = true;
                          this.rawText = m(
                              "textarea",
                              {
                                  oninput: (ev) => {
                                      this.secret = ev.target.value.split("\n")[0].trim();
                                  },
                              },
                              login.raw.trim()
                          );
                      },
                  })
                : null,
        ]),
        m("div.part.details", [
            m("div.part.snack.line-secret", [
                m("div.label", "Secret"),
                m("div.chars", passChars.call(self)),
                !this.editing
                    ? m("div.action.copy", {
                          title: "Copy password",
                          onclick: () => login.doAction("copyPassword"),
                      })
                    : m("div.action.generate", {
                          title: "Generate new password",
                          onclick: () => {
                              this.rawText.dom.value = this.rawText.dom.value.replace(
                                  /^.*((?:(<?\r)\n)|(?:\n\r?))/,
                                  generateSecret() + "$1"
                              );
                              this.rawText.dom.dispatchEvent(new Event("input"));
                          },
                      }),
            ]),
            !this.editing
                ? m("div.part.snack.line-login", [
                      m("div.label", "Login"),
                      m("div", login.fields.login),
                      m("div.action.copy", {
                          title: "Copy username",
                          onclick: () => login.doAction("copyUsername"),
                      }),
                  ])
                : null,
            (() => {
                if (
                    !this.editing &&
                    this.settings.enableOTP &&
                    login.fields.otp &&
                    login.fields.otp.params.type === "totp"
                ) {
                    // update progress
                    let progress = this.progress;
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
                            title: "Copy token",
                            onclick: () => login.doAction("copyOTP"),
                        }),
                    ]);
                }
            })(),
            m("div.part.raw", this.rawText),
        ])
    );

    return nodes;
}
