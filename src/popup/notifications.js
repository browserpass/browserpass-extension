/**
 * Original source credit goes to github.com/tabula-rasa
 * https://gist.github.com/tabula-rasa/61d2ab25aac779fdf9899f4e87ab8306
 * with some changes.
 */

const m = require("mithril");

/**
 * Generate a globally unique id
 *
 * @since 3.X.Y
 *
 * Original source credit goes to github.com/tabula-rasa
 * https://gist.github.com/tabula-rasa/61d2ab25aac779fdf9899f4e87ab8306
 * @returns {string}
 */
function guid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        var r = (Math.random() * 16) | 0,
            v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

let state = {
    list: [],
    destroy(msg) {
        let index = state.list.findIndex((x) => x.id === msg.id);
        state.list.splice(index, 1);
    },
};

function addSuccess(text, timeout = 0) {
    state.list.push({ id: guid(), type: "success", text, timeout });
}
function addInfo(text, timeout = 0) {
    state.list.push({ id: guid(), type: "info", text, timeout });
}
function addWarning(text, timeout = 0) {
    state.list.push({ id: guid(), type: "warning", text, timeout });
}

function addDanger(text, timeout = 0) {
    state.list.push({ id: guid(), type: "danger", text, timeout });
}

let Notifications = {
    view(vnode) {
        let ui = vnode.state;
        return state.list
            ? m(
                  ".m-notifications",
                  state.list.map((msg) => {
                      return m("div", { key: msg.id }, m(Notification, msg)); //wrap in div with key for proper dom updates
                  })
              )
            : null;
    },
    errorMsg: addDanger,
    infoMsg: addInfo,
    successMsg: addSuccess,
    warningMsg: addWarning,
};

let Notification = {
    oninit(vnode) {
        if (vnode.attrs.timeout > 0) {
            setTimeout(() => {
                Notification.destroy(vnode);
            }, vnode.attrs.timeout);
        }
    },
    notificationClass(type) {
        const types = ["info", "warning", "success", "danger"];
        if (types.indexOf(type) > -1) return type;
        return "info";
    },
    destroy(vnode) {
        state.destroy(vnode.attrs);
        m.redraw();
    },
    view(vnode) {
        let ui = vnode.state;
        let msg = vnode.attrs;
        return m(
            ".m-notification",
            {
                class: ui.notificationClass(msg.type),
                onclick: () => {
                    ui.destroy(vnode);
                },
            },
            msg.text
        );
    },
};

module.exports = Notifications;
