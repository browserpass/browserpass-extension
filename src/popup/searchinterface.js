module.exports = SearchInterface;

const BrowserpassURL = require("@browserpass/url");
const m = require("mithril");

/**
 * Search interface
 *
 * @since 3.0.0
 *
 * @param object interface Popup main interface
 * @return void
 */
function SearchInterface(popup) {
    // public methods
    this.view = view;

    // fields
    this.popup = popup;
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
    var self = this;
    var host = new BrowserpassURL(this.popup.settings.origin).host;
    return m(
        "form.part.search",
        {
            onkeydown: function (e) {
                switch (e.code) {
                    case "Tab":
                        e.preventDefault();
                        if (e.shiftKey) {
                            document.querySelector(".part.add").focus();
                            break;
                        }
                    // fall through to ArrowDown
                    case "ArrowDown":
                        e.preventDefault();
                        if (self.popup.results.length) {
                            document.querySelector("*[tabindex]").focus();
                        }
                        break;
                    case "ArrowUp":
                        e.preventDefault();
                        document.querySelector(".part.add").focus();
                        break;
                    case "End":
                        if (!e.shiftKey) {
                            e.preventDefault();
                            document.querySelector(".part.add").focus();
                        }
                        break;
                    case "Enter":
                        e.preventDefault();
                        if (self.popup.results.length) {
                            self.popup.results[0].doAction("fill");
                        }
                        break;
                }
            },
        },
        [
            this.popup.currentDomainOnly
                ? m("div.hint.badge", [
                      host,
                      m("div.remove-hint", {
                          title: "Clear domain filter | <Backspace>",
                          onclick: function (e) {
                              var target = document.querySelector(
                                  ".part.search > input[type=text]"
                              );
                              target.focus();
                              self.popup.currentDomainOnly = false;
                              self.popup.search(target.value);
                          },
                      }),
                  ])
                : null,
            m("input[type=text]", {
                focused: true,
                placeholder: "Search logins...",
                oncreate: function (e) {
                    e.dom.focus();
                },
                oninput: function (e) {
                    self.popup.search(e.target.value);
                },
                onkeydown: function (e) {
                    switch (e.code) {
                        case "Backspace":
                            if (self.popup.currentDomainOnly) {
                                if (e.target.value.length == 0) {
                                    self.popup.currentDomainOnly = false;
                                    self.popup.search("");
                                } else if (
                                    e.target.selectionStart == 0 &&
                                    e.target.selectionEnd == 0
                                ) {
                                    self.popup.currentDomainOnly = false;
                                    self.popup.search(e.target.value);
                                }
                            }
                            break;
                        case "KeyC":
                            if (e.ctrlKey && e.target.selectionStart == e.target.selectionEnd) {
                                e.preventDefault();
                                self.popup.results[0].doAction(
                                    e.shiftKey ? "copyUsername" : "copyPassword"
                                );
                            }
                            break;
                        case "KeyG":
                            if (e.ctrlKey && e.target.selectionStart == e.target.selectionEnd) {
                                e.preventDefault();
                                self.popup.results[0].doAction(
                                    e.shiftKey ? "launchInNewTab" : "launch"
                                );
                            }
                            break;
                        case "KeyO":
                            if (e.ctrlKey && e.target.selectionStart == e.target.selectionEnd) {
                                e.preventDefault();
                                self.popup.results[0].doAction("getDetails");
                            }
                            break;
                        case "End": {
                            if (e.target.selectionStart === e.target.value.length) {
                                let logins = document.querySelectorAll(".login");
                                if (logins.length) {
                                    let target = logins.item(logins.length - 1);
                                    target.focus();
                                    target.scrollIntoView();
                                }
                            }
                            break;
                        }
                    }
                },
            }),
        ]
    );
}
