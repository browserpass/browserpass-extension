//------------------------------------- Initialization --------------------------------------//
"use strict";

//----------------------------------- Function definitions ----------------------------------//
chrome.runtime.onMessage.addListener(handleMessage);

async function handleMessage(message, sender, sendResponse) {
    if (sender.id !== chrome.runtime.id) {
        // silently exit without responding when the source is foreign
        return;
    }

    // Return early if this message isn't meant for the offscreen document.
    if (message.target !== "offscreen-doc") {
        return;
    }

    // Dispatch the message to an appropriate handler.
    let reply;
    try {
        switch (message.type) {
            case "copy-data-to-clipboard":
                writeToClipboard(message.data);
                break;
            case "read-from-clipboard":
                reply = readFromClipboard();
                break;
            default:
                console.warn(`Unexpected message type received: '${message.type}'.`);
        }
        sendResponse({ status: "ok", message: reply || undefined });
    } catch (e) {
        sendResponse({ status: "error", message: e.toString() });
    }
}

/**
 * Read plain text from clipboard
 *
 * @since 3.2.0
 *
 * @return string The current plaintext content of the clipboard
 */
function readFromClipboard() {
    const ta = document.querySelector("#text");
    // these lines are carefully crafted to make paste work in both Chrome and Firefox
    ta.contentEditable = true;
    ta.textContent = "";
    ta.select();
    document.execCommand("paste");
    const content = ta.value;
    return content;
}

/**
 * Copy text to clipboard and optionally clear it from the clipboard after one minute
 *
 * @since 3.2.0
 *
 * @param string text Text to copy
 * @param boolean clear Whether to clear the clipboard after one minute
 * @return void
 */
async function writeToClipboard(text) {
    // Error if we received the wrong kind of data.
    if (typeof text !== "string") {
        throw new TypeError(`Value provided must be a 'string', got '${typeof text}'.`);
    }

    document.addEventListener(
        "copy",
        function (e) {
            e.clipboardData.setData("text/plain", text);
            e.preventDefault();
        },
        { once: true }
    );
    document.execCommand("copy");
}
