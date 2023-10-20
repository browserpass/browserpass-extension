(function () {
    const FORM_MARKERS = ["login", "log-in", "log_in", "signin", "sign-in", "sign_in"];
    const OPENID_FIELDS = {
        selectors: ["input[name*=openid i]", "input[id*=openid i]", "input[class*=openid i]"],
        types: ["text"],
    };
    const USERNAME_FIELDS = {
        selectors: [
            "input[autocomplete=username i]",

            "input[name=login i]",
            "input[name=user i]",
            "input[name=username i]",
            "input[name=email i]",
            "input[name=alias i]",
            "input[id=login i]",
            "input[id=user i]",
            "input[id=username i]",
            "input[id=email i]",
            "input[id=alias i]",
            "input[class=login i]",
            "input[class=user i]",
            "input[class=username i]",
            "input[class=email i]",
            "input[class=alias i]",

            "input[name*=login i]",
            "input[name*=user i]",
            "input[name*=email i]",
            "input[name*=alias i]",
            "input[id*=login i]",
            "input[id*=user i]",
            "input[id*=email i]",
            "input[id*=alias i]",
            "input[class*=login i]",
            "input[class*=user i]",
            "input[class*=email i]",
            "input[class*=alias i]",

            "input[type=email i]",
            "input[autocomplete=email i]",
            "input[type=text i]",
            "input[type=tel i]",
        ],
        types: ["email", "text", "tel"],
    };
    const PASSWORD_FIELDS = {
        selectors: [
            "input[type=password i][autocomplete=current-password i]",
            "input[type=password i]",
        ],
    };
    const INPUT_FIELDS = {
        selectors: PASSWORD_FIELDS.selectors
            .concat(USERNAME_FIELDS.selectors)
            .concat(OPENID_FIELDS.selectors),
    };
    const SUBMIT_FIELDS = {
        selectors: [
            "[type=submit i]",

            "button[name=login i]",
            "button[name=log-in i]",
            "button[name=log_in i]",
            "button[name=signin i]",
            "button[name=sign-in i]",
            "button[name=sign_in i]",
            "button[id=login i]",
            "button[id=log-in i]",
            "button[id=log_in i]",
            "button[id=signin i]",
            "button[id=sign-in i]",
            "button[id=sign_in i]",
            "button[class=login i]",
            "button[class=log-in i]",
            "button[class=log_in i]",
            "button[class=signin i]",
            "button[class=sign-in i]",
            "button[class=sign_in i]",
            "input[type=button i][name=login i]",
            "input[type=button i][name=log-in i]",
            "input[type=button i][name=log_in i]",
            "input[type=button i][name=signin i]",
            "input[type=button i][name=sign-in i]",
            "input[type=button i][name=sign_in i]",
            "input[type=button i][id=login i]",
            "input[type=button i][id=log-in i]",
            "input[type=button i][id=log_in i]",
            "input[type=button i][id=signin i]",
            "input[type=button i][id=sign-in i]",
            "input[type=button i][id=sign_in i]",
            "input[type=button i][class=login i]",
            "input[type=button i][class=log-in i]",
            "input[type=button i][class=log_in i]",
            "input[type=button i][class=signin i]",
            "input[type=button i][class=sign-in i]",
            "input[type=button i][class=sign_in i]",

            "button[name*=login i]",
            "button[name*=log-in i]",
            "button[name*=log_in i]",
            "button[name*=signin i]",
            "button[name*=sign-in i]",
            "button[name*=sign_in i]",
            "button[id*=login i]",
            "button[id*=log-in i]",
            "button[id*=log_in i]",
            "button[id*=signin i]",
            "button[id*=sign-in i]",
            "button[id*=sign_in i]",
            "button[class*=login i]",
            "button[class*=log-in i]",
            "button[class*=log_in i]",
            "button[class*=signin i]",
            "button[class*=sign-in i]",
            "button[class*=sign_in i]",
            "input[type=button i][name*=login i]",
            "input[type=button i][name*=log-in i]",
            "input[type=button i][name*=log_in i]",
            "input[type=button i][name*=signin i]",
            "input[type=button i][name*=sign-in i]",
            "input[type=button i][name*=sign_in i]",
            "input[type=button i][id*=login i]",
            "input[type=button i][id*=log-in i]",
            "input[type=button i][id*=log_in i]",
            "input[type=button i][id*=signin i]",
            "input[type=button i][id*=sign-in i]",
            "input[type=button i][id*=sign_in i]",
            "input[type=button i][class*=login i]",
            "input[type=button i][class*=log-in i]",
            "input[type=button i][class*=log_in i]",
            "input[type=button i][class*=signin i]",
            "input[type=button i][class*=sign-in i]",
            "input[type=button i][class*=sign_in i]",
        ],
    };

    /**
     * Fill password
     *
     * @since 3.0.0
     *
     * @param object request Form fill request
     * @return object result of filling a form
     */
    function fillLogin(request) {
        var result = {
            filledFields: [],
            foreignFill: undefined,
        };

        // get the login form
        let loginForm = undefined;
        if (request.fields.includes("openid")) {
            // this is an attempt to fill a form containing only openid field
            loginForm = form(OPENID_FIELDS);
        } else {
            // this is an attempt to fill a regular login form
            loginForm = form(INPUT_FIELDS);
        }

        // don't attempt to fill non-secret forms unless non-secret filling is allowed
        if (!request.allowNoSecret && !find(PASSWORD_FIELDS, loginForm)) {
            return result;
        }

        // ensure the origin is the same, or ask the user for permissions to continue
        if (window.location.origin !== request.origin) {
            if (!request.allowForeign || request.foreignFills[window.location.origin] === false) {
                return result;
            }
            var message =
                "You have requested to fill login credentials into an embedded document from a " +
                "different origin than the main document in this tab. Do you wish to proceed?\n\n" +
                `Tab origin: ${request.origin}\n` +
                `Embedded origin: ${window.location.origin}`;
            if (request.foreignFills[window.location.origin] !== true) {
                result.foreignOrigin = window.location.origin;
                result.foreignFill = confirm(message);
                if (!result.foreignFill) {
                    return result;
                }
            }
        }

        // fill login field
        if (
            request.fields.includes("login") &&
            update(USERNAME_FIELDS, request.login.fields.login, loginForm)
        ) {
            result.filledFields.push("login");
        }

        // fill secret field
        if (
            request.fields.includes("secret") &&
            update(PASSWORD_FIELDS, request.login.fields.secret, loginForm)
        ) {
            result.filledFields.push("secret");
        }

        // fill openid field
        if (
            request.fields.includes("openid") &&
            update(OPENID_FIELDS, request.login.fields.openid, loginForm)
        ) {
            result.filledFields.push("openid");
        }

        // finished filling things successfully
        return result;
    }

    /**
     * Focus submit button, and maybe click on it (based on user settings)
     *
     * @since 3.0.0
     *
     * @param object request Form fill request
     * @return object result of focusing or submitting a form
     */
    function focusOrSubmit(request) {
        var result = {};

        // get the login form
        let loginForm = undefined;
        if (request.filledFields.includes("openid")) {
            // this is an attempt to focus or submit a form containing only openid field
            loginForm = form(OPENID_FIELDS);
        } else {
            // this is an attempt to focus or submit a regular login form
            loginForm = form(INPUT_FIELDS);
        }

        // ensure the origin is the same or allowed
        if (window.location.origin !== request.origin) {
            if (!request.allowForeign || request.foreignFills[window.location.origin] === false) {
                return;
            }
        }

        // check for multiple password fields in the login form
        var password_inputs = queryAllVisible(document, PASSWORD_FIELDS, loginForm);
        if (password_inputs.length > 1) {
            // There is likely a field asking for OTP code, so do not submit form just yet
            password_inputs[1].select();
        } else {
            // try to locate the submit button
            var submit = find(SUBMIT_FIELDS, loginForm);

            // Try to submit the form, or focus on the submit button (based on user settings)
            if (submit) {
                if (request.autoSubmit) {
                    submit.click();
                } else {
                    submit.focus();
                }
            } else {
                // We need to keep focus somewhere within the form, so that Enter hopefully submits the form.
                for (let selectors of [OPENID_FIELDS, PASSWORD_FIELDS, USERNAME_FIELDS]) {
                    let field = find(selectors, loginForm);
                    if (field) {
                        field.focus();
                        break;
                    }
                }
            }
        }

        return result;
    }

    /**
     * Query all visible elements
     *
     * @since 3.0.0
     *
     * @param DOMElement parent Parent element to query
     * @param object     field  Field to search for
     * @param DOMElement form   Search only within this form
     * @return array List of search results
     */
    function queryAllVisible(parent, field, form) {
        const result = [];
        for (let i = 0; i < field.selectors.length; i++) {
            let elems = parent.querySelectorAll(field.selectors[i]);
            for (let j = 0; j < elems.length; j++) {
                let elem = elems[j];
                // Select only elements from specified form
                if (form && form != elem.form) {
                    continue;
                }
                // Ignore disabled fields
                if (elem.disabled) {
                    continue;
                }
                // Elem or its parent has a style 'display: none',
                // or it is just too narrow to be a real field (a trap for spammers?).
                if (elem.offsetWidth < 30 || elem.offsetHeight < 10) {
                    continue;
                }
                // We may have a whitelist of acceptable field types. If so, skip elements of a different type.
                if (field.types && field.types.indexOf(elem.type.toLowerCase()) < 0) {
                    continue;
                }
                // Elem takes space on the screen, but it or its parent is hidden with a visibility style.
                let style = window.getComputedStyle(elem);
                if (style.visibility == "hidden") {
                    continue;
                }
                // Elem is outside of the boundaries of the visible viewport.
                let rect = elem.getBoundingClientRect();
                if (
                    rect.x + rect.width < 0 ||
                    rect.y + rect.height < 0 ||
                    rect.x > window.innerWidth ||
                    rect.y > window.innerHeight
                ) {
                    continue;
                }
                // Elem is hidden by its or or its parent's opacity rules
                const OPACITY_LIMIT = 0.1;
                let opacity = 1;
                for (
                    let testElem = elem;
                    opacity >= OPACITY_LIMIT && testElem && testElem.nodeType === Node.ELEMENT_NODE;
                    testElem = testElem.parentNode
                ) {
                    let style = window.getComputedStyle(testElem);
                    if (style.opacity) {
                        opacity *= parseFloat(style.opacity);
                    }
                }
                if (opacity < OPACITY_LIMIT) {
                    continue;
                }
                // This element is visible, will use it.
                result.push(elem);
            }
        }
        return result;
    }

    /**
     * Query first visible element
     *
     * @since 3.0.0
     *
     * @param DOMElement parent Parent element to query
     * @param object     field  Field to search for
     * @param DOMElement form   Search only within this form
     * @return array First search result
     */
    function queryFirstVisible(parent, field, form) {
        var elems = queryAllVisible(parent, field, form);
        return elems.length > 0 ? elems[0] : undefined;
    }

    /**
     * Detect the login form
     *
     * @since 3.0.0
     *
     * @param array selectors Selectors to use to find the right form
     * @return The login form
     */
    function form(selectors) {
        const elems = queryAllVisible(document, selectors, undefined);
        const forms = [];
        for (let elem of elems) {
            const form = elem.form;
            if (form && forms.indexOf(form) < 0) {
                forms.push(form);
            }
        }

        // Try to filter only forms that have some identifying marker
        const markedForms = [];
        for (let form of forms) {
            const props = ["id", "name", "class", "action"];
            for (let marker of FORM_MARKERS) {
                for (let prop of props) {
                    let propValue = form.getAttribute(prop) || "";
                    if (propValue.toLowerCase().indexOf(marker) > -1) {
                        markedForms.push(form);
                    }
                }
            }
        }

        // Try to filter only forms that have a password field
        const formsWithPassword = [];
        for (let form of markedForms) {
            if (find(PASSWORD_FIELDS, form)) {
                formsWithPassword.push(form);
            }
        }

        // Give up and return the first available form, if any
        if (formsWithPassword.length > 0) {
            return formsWithPassword[0];
        }
        if (markedForms.length > 0) {
            return markedForms[0];
        }
        if (forms.length > 0) {
            return forms[0];
        }
        return undefined;
    }

    /**
     * Find a form field
     *
     * @since 3.0.0
     *
     * @param object     field Field to search for
     * @param DOMElement form  Form to search in
     * @return DOMElement First matching form field
     */
    function find(field, form) {
        return queryFirstVisible(document, field, form);
    }

    /**
     * Update a form field value
     *
     * @since 3.0.0
     *
     * @param object     field Field to update
     * @param string     value Value to set
     * @param DOMElement form  Form for which to set the given field
     * @return bool Whether the update succeeded
     */
    function update(field, value, form) {
        if (value === undefined) {
            // undefined values should not be filled, but are always considered successful
            return true;
        }

        if (!value.length) {
            return false;
        }

        // Focus the input element first
        let el = find(field, form);
        if (!el) {
            return false;
        }
        for (let eventName of ["click", "focus"]) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        }

        // Focus may have triggered unveiling a true input, find it again
        el = find(field, form);
        if (!el) {
            return false;
        }

        // Focus the potentially new element again
        for (let eventName of ["click", "focus"]) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        }

        // Send some keyboard events indicating that value modification has started (no associated keycode)
        for (let eventName of ["keydown", "keypress", "keyup", "input", "change"]) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        }

        // truncate the value if required by the field
        if (el.maxLength > 0) {
            value = value.substr(0, el.maxLength);
        }

        // Set the field value
        let initialValue = el.value || el.getAttribute("value");
        el.setAttribute("value", value);
        el.value = value;

        // Send the keyboard events again indicating that value modification has finished (no associated keycode)
        for (let eventName of ["keydown", "keypress", "keyup", "input", "change"]) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        }

        // re-set value if unchanged after firing post-fill events
        // (in case of sabotage by the site's own event handlers)
        if ((el.value || el.getAttribute("value")) === initialValue) {
            el.setAttribute("value", value);
            el.value = value;
        }

        // Finally unfocus the element
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        return true;
    }

    // set window object
    window.browserpass = {
        fillLogin: fillLogin,
        focusOrSubmit: focusOrSubmit,
    };
})();
