const m = require("mithril");

const modalId = "browserpass-modal";
const CANCEL = "Cancel";
const CONFIRM = "Confirm";

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
 * @since 3.8.0
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
     * @since 3.8.0
     *
     * @param {string} message      message or html to render in main body of dialog
     * @param {function} callback   function which accepts a single boolean argument
     * @param {string} cancelText   text to display on the negative response button
     * @param {string} confirmText  text to display on the positive response button
     */
    open: (
        message = "",
        callback = (resp = false) => {},
        cancelText = CANCEL,
        confirmText = CONFIRM
    ) => {
        if (!message.length || typeof callback !== "function") {
            return null;
        }

        if (typeof cancelText == "string" && cancelText.length) {
            cancelButtonText = cancelText;
        } else {
            cancelButtonText = CANCEL;
        }

        if (typeof confirmText == "string" && confirmText.length) {
            confirmButtonText = confirmText;
        } else {
            confirmButtonText = CONFIRM;
        }

        modalElement = document.getElementById(modalId);
        callBackFn = callback;
        modalContent = message;
        modalElement.showModal();
        m.redraw();
    },
};

module.exports = Modal;
