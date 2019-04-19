module.exports = AddInterface;
var m = require("mithril");

function AddInterface(credentials, settings) {
    // public methods
    this.attach = attach;
    this.view = view;

    // fields
    this.settings = settings;
    this.credentials = credentials;
    this.dismissCredential = dismissCredential;
}

function attach(element) {
    m.mount(element, this);
}

function view(ctl, params) {
    let credentials = this.credentials.length > 0 ? this.credentials[0] : undefined;

    var nodes = [];

    nodes.push(m("div.label.title", "Save credentials to store?"));

    nodes.push(m("div.label", "Path:"));
    nodes.push(
        m("input.credential", {
            type: "text",
            value: credentials ? credentials.path : ""
        })
    );

    nodes.push(m("div.label", "Username:"));
    nodes.push(
        m("input.credential", {
            type: "text",
            value: credentials ? credentials.login : ""
        })
    );

    nodes.push(m("div.label", "Password:"));
    nodes.push(
        m("input.credential", {
            type: "password",
            value: credentials ? credentials.password : ""
        })
    );

    if (credentials.email) {
        nodes.push(m("div.label", "E-Mail:"));
        nodes.push(
            m("input.credential", {
                type: "text",
                value: credentials ? credentials.email : ""
            })
        );
    }

    nodes.push(
        m("div.buttons", [
            m(
                "button.storeButton",
                {
                    onclick: async function(e) {
                        await credentials.doAction("create");
                    }
                },
                "Yes"
            ),
            m(
                "button.storeButton",
                {
                    onclick: async function(e) {
                        await credentials.doAction("dismiss");
                    }
                },
                "No"
            )
        ])
    );

    return nodes;
}

function dismissCredential() {
    this.credentials.shift();
    return this.credentials.length;
}
