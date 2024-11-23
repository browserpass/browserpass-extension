//------------------------------------- Initialisation --------------------------------------//
"use strict";

const m = require("mithril");

const containsNumbersRegEx = RegExp(/[0-9]/);
const containsSymbolsRegEx = RegExp(/[\p{P}\p{S}]/, "u");

module.exports = {
    highlight,
};

//----------------------------------- Function definitions ----------------------------------//

/**
 * Highlight password characters
 *
 * @since 3.8.0
 *
 * @param {string} secret a string to be split by character
 * @return {array} mithril vnodes to be rendered
 */
function highlight(secret = "") {
    return secret.split("").map((c) => {
        if (c.match(containsNumbersRegEx)) {
            return m("span.char.num", c);
        } else if (c.match(containsSymbolsRegEx)) {
            return m("span.char.punct", c);
        }
        return m("span.char", c);
    });
}
