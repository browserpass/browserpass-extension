// This is a separate script that is injected into all webpages
// unconditionally, as opposed to inject.js that is only injected once
// the user interacts with Browserpass.
//
// Currently, its only function is to track when shadow DOMs are
// created and tag them with an identifier for later retrieval,
// because JavaScript lacks a performant way to query all shadow DOMs
// without doing up-front tracking of them.

var _attachShadow;
if (!_attachShadow) {
    _attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
        this.setAttribute("is-shadow", "");
        return _attachShadow.call(this, options);
    };
    document.documentElement.dataset.browserpassShadowrootsTagged = true;
}
