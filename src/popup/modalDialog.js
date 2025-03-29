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
                cancelButtonText
                    ? m(
                          "button.cancel",
                          {
                              onclick: () => {
                                  buttonClick(false);
                              },
                          },
                          cancelButtonText
                      )
                    : null,
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
     * @param {string} request      object, with type, or string message (html) to render in main body of dialog
     * @param {function} callback   function which accepts a single boolean argument
     * @param {string} cancelText   text to display on the negative response button
     * @param {string} confirmText  text to display on the positive response button
     */
    open: (
        request = "",
        callback = (resp = false) => {},
        cancelText = CANCEL,
        confirmText = CONFIRM
    ) => {
        if (typeof callback !== "function") {
            return null;
        }

        let message = "";
        let type = "info";
        switch (typeof request) {
            case "string":
                if (!request.length) {
                    return null;
                }
                message = request;
                break;
            case "object":
                if (typeof request?.message !== "string") {
                    return null;
                }
                message = request.message;

                if (["info", "warning", "error"].includes(request?.type)) {
                    type = request.type;
                }
                break;
            default:
                return null;
        }

        if (typeof cancelText == "string" && cancelText.length) {
            cancelButtonText = cancelText;
        } else if (cancelText === false) {
            cancelButtonText = undefined;
        } else {
            cancelButtonText = CANCEL;
        }

        if (typeof confirmText == "string" && confirmText.length) {
            confirmButtonText = confirmText;
        } else {
            confirmButtonText = CONFIRM;
        }

        modalElement = document.getElementById(modalId);
        modalElement.classList.remove(...modalElement.classList);
        modalElement.classList.add([type]);
        callBackFn = callback;
        modalContent = message;
        modalElement.showModal();
        m.redraw();
    },
};

module.exports = Modal;
