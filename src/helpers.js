//------------------------------------- Initialisation --------------------------------------//
"use strict";

const TldJS = require("tldjs");

module.exports = {
    pathToDomain
};

//----------------------------------- Function definitions ----------------------------------//

/**
 * Get the deepest available domain component of a path
 *
 * @since 3.0.0
 *
 * @param string path        Path to parse
 * @param string currentHost Current hostname for the active tab
 * @return string|null Extracted domain
 */
function pathToDomain(path, currentHost) {
    var parts = path.split(/\//).reverse();
    for (var key in parts) {
        if (parts[key].indexOf("@") >= 0) {
            continue;
        }
        var t = TldJS.parse(parts[key]);
        if (
            t.isValid &&
            ((t.tldExists && t.domain !== null) ||
                t.hostname === currentHost ||
                currentHost.endsWith(`.${t.hostname}`))
        ) {
            return t.hostname;
        }
    }

    return null;
}
