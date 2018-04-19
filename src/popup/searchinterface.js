module.exports = SearchInterface;

var m = require("mithril");

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
    return m(
        "form.part.search",
        {
            onsubmit: function(e) {
                e.preventDefault();
            },
            onkeydown: function(e) {
                switch (e.code) {
                    case "ArrowDown":
                        if (self.popup.results.length) {
                            document.querySelector("*[tabindex]").focus();
                        }
                        break;
                    case "Enter":
                        if (self.popup.results.length) {
                            self.popup.results[0].doAction("fill");
                        }
                        break;
                }
            }
        },
        [
            this.popup.active ? m("div.hint.badge", this.popup.settings.host) : null,
            m("input[type=text]", {
                focused: true,
                placeholder: "Search logins...",
                oncreate: function(e) {
                    e.dom.focus();
                },
                oninput: function(e) {
                    self.popup.search(e.target.value.trim(), e.target.value.substr(0, 1) !== " ");
                },
                onkeydown: function(e) {
                    switch (e.code) {
                        case "Backspace":
                            if (self.popup.active && e.target.value.length == 0) {
                                self.popup.active = false;
                                self.popup.search("");
                            }
                            break;
                    }
                }
            })
        ]
    );
}
