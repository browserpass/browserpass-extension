const m = require("mithril");

const modalId = "browserpass-modal";

/**
 * Basic mirthil dialog component. Shows modal dialog with
 * provided message content and passes back boolean
 * user response via a callback function.
 */

var callBackFn = null,
    cancelButtonText = null,
    confirmButtonText = null,
    modalElement = null,
    modalContent = null;

/**
 * Handle modal button click.
 *
 * Trigger callback with boolean response, hide modal, clear values.
 *
 * @since 3.X.Y
 *
 */
function buttonClick(response = false) {
    // run action handler
    if (typeof callBackFn === "function") {
        callBackFn(response);
    }

    // close and clear modal content state
    modalElement.close();
    callBackFn = null;
    modalContent = null;
}

let Modal = {
    view: (node) => {
        return m("dialog", { id: modalId }, [
            m(".modal-content", {}, m.trust(modalContent)),
            m(".modal-actions", {}, [
                m(
                    "button.cancel",
                    {
                        onclick: () => {
                            buttonClick(false);
                        },
                    },
                    cancelButtonText
                ),
                m(
                    "button.confirm",
                    {
                        onclick: () => {
                            buttonClick(true);
                        },
                    },
                    confirmButtonText
                ),
            ]),
        ]);
    },
    /**
     * Show dialog component after args validation
     *
     * @since 3.X.Y
     *
     * @param {string} message
     * @param {function} callback
     * @param {string} cancelText
     * @param {string} confirmText
     */
    open: (
        message = "",
        callback = (resp = false) => {},
        cancelText = "Cancel",
        confirmText = "Confirm"
    ) => {
        if (!message.length || typeof callback !== "function") {
            return null;
        }

        if (typeof cancelText == "string" && cancelText.length) {
            cancelButtonText = cancelText;
        } else {
            cancelButtonText = "Cancel";
        }

        if (typeof confirmText == "string" && confirmText.length) {
            confirmButtonText = confirmText;
        } else {
            confirmButtonText = "Confirm";
        }

        modalElement = document.getElementById(modalId);
        callBackFn = callback;
        modalContent = message;
        modalElement.showModal();
        m.redraw();
    },
};

module.exports = Modal;
