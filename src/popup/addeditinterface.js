module.exports = AddEditInterface;

var m = require("mithril");

/**
 * Add/Edit interface
 *
 * @since 3.1.0
 *
 * @param object interface Popup interface
 * @return void
 */
function AddEditInterface(popup) {
    // public methods
    this.view = view;

    // fields
    this.popup = popup;
}

/**
 * Generates vnodes for render
 *
 * @since 3.1.0
 *
 * @param function ctl    Controller
 * @param object   params Runtime params
 * @return []Vnode
 */
function view(ctl, params) {
    const items = [
        m("div.title", [
            m("div.btn.back", {
                onclick: (e) => {
                    this.popup.editing = false;
                },
            }),
            m("span", this.popup.new ? "Add credentials" : "Edit credentials"),
            m("div.btn.save"),
        ]),
        m("div.location", [
            m("div.store", [
                m(
                    "select",
                    { disabled: !this.popup.new },
                    m("option", { value: "pass" }, "pass"),
                    m("option", { value: "demo" }, "demo")
                ),
                m("div.storePath", "~/.password-store/"),
            ]),
            m("div.path", [
                m("input[type=text]", {
                    placeholder: "filename",
                    disabled: !this.popup.new,
                    value: this.popup.new ? "" : "personal/github.com",
                }),
                m("div", ".gpg"),
            ]),
        ]),
        m("div.contents", [
            m("div.password", [
                m("input[type=text]", {
                    placeholder: "password",
                    value: this.popup.new ? "" : "p@ssw0rd",
                }),
                m("div.btn.generate"),
            ]),
            m("div.options", [
                m("input[type=checkbox]", {
                    id: "include_symbols",
                    checked: true,
                }),
                m("label", { for: "include_symbols" }, "symbols"),
                m("input[type=number]", {
                    value: "40",
                }),
                m("span", "length"),
            ]),
            m(
                "div.details",
                m("textarea", {
                    placeholder: "user: johnsmith",
                    value: this.popup.new ? "" : "user: maximbaz",
                })
            ),
        ]),
    ];

    if (!this.popup.new) {
        items.push(m("div.actions", m("button.delete", "Delete")));
    }

    return m("div.addEdit", items);
}
