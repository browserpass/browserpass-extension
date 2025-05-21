//------------------------------------- Initialization --------------------------------------//
"use strict";

module.exports = {
    readFromClipboard,
    writeToClipboard,
};
//----------------------------------- Function definitions ----------------------------------//

/**
 * Read plain text from clipboard
 *
 * @since 3.2.0
 *
 * @return string The current plaintext content of the clipboard
 */
function readFromClipboard() {
    const ta = document.createElement("textarea");
    // these lines are carefully crafted to make paste work in both Chrome and Firefox
    ta.contentEditable = true;
    ta.textContent = "";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("paste");
    const content = ta.value;
    document.body.removeChild(ta);
    return content;
}

/**
 * Copy text to clipboard and optionally clear it from the clipboard after one minute
 *
 * @since 3.2.0
 *
 * @param string text Text to copy
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
