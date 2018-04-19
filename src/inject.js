(function() {
    /**
     * Fill password
     *
     * @since 3.0.0
     *
     * @param object login Login fields
     * @return void
     */
    function fillLogin(login) {
        alert("Fill login: " + JSON.stringify(login));
    }

    // set window object
    window.browserpass = {
        fillLogin: fillLogin
    };
})();
