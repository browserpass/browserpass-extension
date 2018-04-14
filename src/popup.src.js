//------------------------------------- Initialisation --------------------------------------//
"use strict";

require("chrome-extension-async");

var settings = null;
if (typeof browser === "undefined") {
    var browser = chrome;
}

browser.runtime.sendMessage({ action: "getSettings" }).then(
    function(response) {
        settings = response;
        run();
    },
    function(response) {
        console.log(response); // TODO
    }
);

//----------------------------------- Function definitions ----------------------------------//
function run() {
    console.log(settings); // TODO
}
