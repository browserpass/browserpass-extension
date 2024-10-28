module.exports = Interface;

const m = require("mithril");

/**
 * Options main interface
 *
 * @since 3.0.0
 *
 * @param object settings Settings object
 * @param function saveSettings Function to save settings
 * @param function clearUsageData Function to clear usage data
 * @return void
 */
function Interface(settings, saveSettings, clearUsageData) {
    // public methods
    this.attach = attach;
    this.view = view;

    // fields
    this.settings = settings;
    this.saveSettings = saveSettings;
    this.saveEnabled = false;
    this.clearUsageData = clearUsageData;
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
    var nodes = [];
    nodes.push(m("h3", "Basic settings"));
    nodes.push(
        createCheckbox.call(
            this,
            "autoSubmit",
            "Automatically submit forms after filling (not recommended)"
        )
    );
    nodes.push(
        createCheckbox.call(this, "enableOTP", "Enable support for OTP tokens (not recommended)")
    );
    nodes.push(createCheckbox.call(this, "hideBadge", "Hide badge counter on the toolbar icon"));
    nodes.push(createInput.call(this, "username", "Default username", "john.smith"));
    nodes.push(createInput.call(this, "gpgPath", "Custom gpg binary", "/path/to/gpg"));

    nodes.push(m("h3", "Theme"));
    nodes.push(
        createDropdown.call(this, "theme", [
            m("option", { value: "auto" }, "Auto"),
            m("option", { value: "dark" }, "Dark"),
            m("option", { value: "light" }, "Light"),
        ])
    );

    nodes.push(m("h3", "Custom store locations"));
    nodes.push(
        m("div", { class: "notice" }, "(this overrides default store and $PASSWORD_STORE_DIR)")
    );
    for (var storeId in this.settings.stores) {
        nodes.push(createCustomStore.call(this, storeId));
    }
    nodes.push(
        m(
            "a.add-store",
            {
                onclick: () => {
                    addEmptyStore(this.settings.stores);
                    this.saveEnabled = true;
                },
            },
            "Add store"
        )
    );

    if (typeof this.error !== "undefined") {
        nodes.push(m("div.error", this.error.message));
    }
    if (this.settings.hasOwnProperty("hostError")) {
        let hostError = this.settings.hostError;
        nodes.push(m("div.error", hostError.params.message));
    }

    nodes.push(
        m(
            "button.save",
            {
                disabled: !this.saveEnabled,
                onclick: async () => {
                    try {
                        this.settings = await this.saveSettings(this.settings);
                        this.error = undefined;
                    } catch (e) {
                        this.error = e;
                    }
                    this.saveEnabled = false;
                    m.redraw();
                },
            },
            "Save"
        )
    );

    nodes.push(
        m(
            "button.clearUsageData",
            {
                onclick: async () => {
                    try {
                        await this.clearUsageData();
                        this.error = undefined;
                    } catch (e) {
                        this.error = e;
                    }
                    m.redraw();
                },
            },
            "Clear usage data"
        )
    );
    return nodes;
}

/**
 * Generates vnode for a input setting
 *
 * @since 3.0.0
 *
 * @param string key    Settings key
 * @param string title  Settings title
 * @param string placeholder  Settings placeholder
 * @return Vnode
 */
function createInput(key, title, placeholder) {
    return m("div.option", { class: key }, [
        m("label", [
            title,
            m("input[type=text]", {
                value: this.settings[key],
                placeholder: placeholder,
                onchange: (e) => {
                    this.settings[key] = e.target.value;
                    this.saveEnabled = true;
                },
            }),
        ]),
    ]);
}

/**
 * Generates vnode for a dropdown setting
 *
 * @since 3.3.1
 *
 * @param string key     Settings key
 * @param array options  Array of objects with value and text fields
 * @return Vnode
 */
function createDropdown(key, options) {
    return m(
        "select",
        {
            value: this.settings[key],
            onchange: (e) => {
                this.settings[key] = e.target.value;
                this.saveEnabled = true;
            },
        },
        options
    );
}

/**
 * Generates vnode for a checkbox setting
 *
 * @since 3.0.0
 *
 * @param string key    Settings key
 * @param string title  Label for the checkbox
 * @return Vnode
 */
function createCheckbox(key, title) {
    return m("div.option", { class: key }, [
        m("label", [
            m("input[type=checkbox]", {
                title: title,
                checked: this.settings[key],
                onchange: (e) => {
                    this.settings[key] = e.target.checked;
                    this.saveEnabled = true;
                },
            }),
            title,
        ]),
    ]);
}

/**
 * Generates vnode for a custom store configuration
 *
 * @since 3.0.0
 *
 * @param string storeId    Store ID
 * @return Vnode
 */
function createCustomStore(storeId) {
    let store = this.settings.stores[storeId];

    return m("div.option.custom-store", { class: "store-" + store.name }, [
        m("input[type=text].name", {
            title: "The name for this password store",
            value: store.name,
            placeholder: "name",
            onchange: (e) => {
                store.name = e.target.value;
                this.saveEnabled = true;
            },
        }),
        m("input[type=text].path", {
            title: "The full path to this password store",
            value: store.path,
            placeholder: "/path/to/store",
            onchange: (e) => {
                store.path = e.target.value;
                this.saveEnabled = true;
            },
        }),
        m("input[type=text].bgColor", {
            title: "Badge background color",
            value: store.bgColor,
            placeholder: "#626262",
            onchange: (e) => {
                store.bgColor = e.target.value;
                this.saveEnabled = true;
            },
        }),
        m("input[type=text].color", {
            title: "Badge text color",
            value: store.color,
            placeholder: "#c4c4c4",
            onchange: (e) => {
                store.color = e.target.value;
                this.saveEnabled = true;
            },
        }),
        m(
            "a.remove",
            {
                title: "Remove this password store",
                onclick: () => {
                    delete this.settings.stores[storeId];
                    this.saveEnabled = true;
                },
            },
            "[X]"
        ),
    ]);
}

/**
 * Generates new store ID
 *
 * @since 3.0.0
 *
 * @return string new store ID
 */
function newId() {
    return Math.random().toString(36).substr(2, 9);
}

/**
 * Generates a new empty store
 *
 * @since 3.0.0
 *
 * @param []object stores   List of stores to add a new store to
 * @return void
 */
function addEmptyStore(stores) {
    let store = { id: newId(), name: "", path: "" };
    stores[store.id] = store;
}
