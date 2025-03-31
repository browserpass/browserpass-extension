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
    console.debug(`increaseModalHeight(referenceElement...${referenceElement && "present"})`, {
        referenceElement,
        exists: Boolean(referenceElement),
        height: referenceElement.clientHeight,
    });
    if (!referenceElement) {
        return;
    }
    const rootContentEl = document.getRootNode().getElementsByClassName("layout")[0] ?? null;
    console.debug(`increaseModalHeight()`, {
        rootContentEl,
        exists: Boolean(rootContentEl),
        height: rootContentEl.clientHeight,
    });
    if (rootContentEl) {
        let count = 0;
        while (
            rootContentEl.clientHeight < 1000 &&
            rootContentEl.clientHeight < referenceElement?.clientHeight + heightDiff
        ) {
            console.log(count, rootContentEl, referenceElement);
            rootContentEl.classList.remove(...rootContentEl.classList);
            rootContentEl.classList.add(...["layout", `mh-${count}`]);
            m.redraw();
            count += 1;
        }
    }
}
