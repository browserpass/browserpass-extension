// This script is a simple stub to inject the real early-inject.js.
// Two steps are needed because content_script scripts don't execute
// in the same context as the page, which we need in order to add
// attributes to the real DOM.

const injectedScript = document.createElement("script");
injectedScript.src = chrome.runtime.getURL("js/early-inject.dist.js");
(document.head || document.documentElement).appendChild(injectedScript);
