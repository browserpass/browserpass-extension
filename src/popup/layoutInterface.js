const m = require("mithril");
const Notifications = require("./notifications");

let session = {
    // current login object details
    current: null,
};

let LayoutInterface = {
    view: function (vnode) {
        vnode.children.push(m(Notifications));
        return m(".layout", vnode.children);
    },
};

function setCurrentLogin(login) {
    session.current = login;
}

function getCurrentLogin() {
    return session.current;
}

module.exports = {
    LayoutInterface,
    setCurrentLogin,
    getCurrentLogin,
};
