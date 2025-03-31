"use strict";

const m = require("mithril");

module.exports = {
    increaseModalHeight,
};

/**
 * Increases modal window height using a document child reference height
 * Maximum height is 1000px
 * @param referenceElement an htmlElement returned from one of document.getElementBy... methods
 * @since 3.10.0
 */
function increaseModalHeight(referenceElement, heightDiff = 50) {
    if (typeof heightDiff != "number") {
        heightDiff = 50;
    }
    if (!referenceElement) {
        return;
    }
    const rootContentEl = document.getRootNode().getElementsByClassName("layout")[0] ?? null;
    if (rootContentEl) {
        let count = 0;
        while (
            rootContentEl.clientHeight < 1000 &&
            rootContentEl.clientHeight < referenceElement?.clientHeight + heightDiff
        ) {
            rootContentEl.classList.remove(...rootContentEl.classList);
            rootContentEl.classList.add(...["layout", `mh-${count}`]);
            m.redraw();
            count += 1;
        }
    }
}
