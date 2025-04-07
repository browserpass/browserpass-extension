//------------------------------------- Initialization --------------------------------------//
"use strict";
const clipboard = require("../helpers/clipboard");

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
                clipboard.writeToClipboard(message.data);
                break;
            case "read-from-clipboard":
                reply = clipboard.readFromClipboard();
                break;
            default:
                console.warn(`Unexpected message type received: '${message.type}'.`);
        }
        sendResponse({ status: "ok", message: reply || undefined });
    } catch (e) {
        sendResponse({ status: "error", message: e.toString() });
    }
}
