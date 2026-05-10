// This is a separate script that is injected into all webpages
// unconditionally, as opposed to inject.js that is only injected once
// the user interacts with Browserpass.
//
// Currently, its only function is to track when shadow DOMs are
// created and tag them with an identifier for later retrieval,
// because JavaScript lacks a performant way to query all shadow DOMs
// without doing up-front tracking of them.
//
// Note: This script is executed in the untrusted PAGE context, not
// the extension context, which means that great care needs to be
// taken with any functionality added here.

var _attachShadow;
if (!_attachShadow) {
    _attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (options) {
        // Make sure to setAttribute asynchronously, to avoid an error
        // in case attachShadow is called during a custom element
        // constructor, see:
        // https://html.spec.whatwg.org/multipage/custom-elements.html#custom-element-conformance
        setTimeout(() => this.setAttribute("browserpass-detected-shadow-root", ""), 0);
        return _attachShadow.call(this, options);
    };
    document.documentElement.setAttribute("browserpass-detected-shadow-roots", "");
}
