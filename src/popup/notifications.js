/**
 * Original source credit goes to github.com/tabula-rasa
 * https://gist.github.com/tabula-rasa/61d2ab25aac779fdf9899f4e87ab8306
 * with some changes.
 */

const m = require("mithril");
const uuidPrefix = RegExp(/^([a-z0-9]){8}-/);

/**
 * Generate a globally unique id
 *
 * @since 3.8.0
 *
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

    /**
     * Remove notification vnode from current state
     *
     * @since 3.8.0
     *
     * @param {object,string} msg vnode object or uuid string of message to remove
     * @returns null
     */
    destroy(msg) {
        let messageId = "";
        if (typeof msg == "string" && msg.search(uuidPrefix) == 0) {
            messageId = msg;
        } else if (msg.hasOwnProperty("id") && msg.id.search(uuidPrefix) == 0) {
            messageId = msg.id;
        } else {
            return;
        }

        // remove message if index of notification state object is found
        let index = state.list.findIndex((x) => x.id === messageId);
        if (index > -1) {
            state.list.splice(index, 1);
        }
    },
};

/**
 * Creates new notification message and adds it to current
 * notification state.
 *
 * @since 3.8.0
 *
 * @param {string} text message to display
 * @param {number} timeout milliseconds timeout until message automatically removed
 * @param {string} type notification message type
 * @returns {string} uuid of new message element
 */
function addMessage(text, timeout, type = "info") {
    const id = guid();
    state.list.push({ id: id, type: type, text, timeout });
    return id;
}

function addSuccess(text, timeout = 3500) {
    return addMessage(text, timeout, "success");
}

function addInfo(text, timeout = 3500) {
    return addMessage(text, timeout, "info");
}

function addWarning(text, timeout = 4000) {
    return addMessage(text, timeout, "warning");
}

function addError(text, timeout = 5000) {
    return addMessage(text, timeout, "error");
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
    // provide caller method to remove message early
    removeMsg(uuid) {
        state.destroy(uuid);
        m.redraw();
    },
    errorMsg: addError,
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
        const types = ["info", "warning", "success", "error"];
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
