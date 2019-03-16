(function() {
    const FORM_MARKERS = ["login", "log-in", "log_in", "signin", "sign-in", "sign_in"];
    const USERNAME_FIELDS = {
        selectors: [
            "input[id*=openid i]",
            "input[name*=openid i]",
            "input[class*=openid i]",

            "input[name*=login i]",
            "input[name*=user i]",
            "input[name*=email i]",
            "input[id*=login i]",
            "input[id*=user i]",
            "input[id*=email i]",
            "input[class*=login i]",
            "input[class*=user i]",
            "input[class*=email i]",
            "input[type=email i]",
            "input[type=text i]",
            "input[type=tel i]"
        ],
        types: ["email", "text", "tel"]
    };
    const PASSWORD_FIELDS = {
        selectors: ["input[type=password i]"]
    };
    const INPUT_FIELDS = {
        selectors: PASSWORD_FIELDS.selectors.concat(USERNAME_FIELDS.selectors)
    };
    const SUBMIT_FIELDS = {
        selectors: [
            "[type=submit i]",
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
            "input[type=button i][class*=sign_in i]"
        ]
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
            foreignFill: undefined
        };

        // get the login form
        var loginForm = form();

        // don't attempt to fill non-secret forms unless non-secret filling is allowed
        if (!find(PASSWORD_FIELDS, loginForm) && !request.allowNoSecret) {
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

        // check for multiple password fields in the login form
        var password_inputs = queryAllVisible(document, PASSWORD_FIELDS, loginForm);
        if (password_inputs.length > 1) {
            // There is likely a field asking for OTP code, so do not submit form just yet
            password_inputs[1].select();
        } else {
            window.requestAnimationFrame(function() {
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
                    // There is no submit button. Try to submit the form itself.
                    if (request.autoSubmit && loginForm) {
                        loginForm.submit();
                    }
                    // We need to keep focus somewhere within the form, so that Enter hopefully submits the form.
                    var password = find(PASSWORD_FIELDS, loginForm);
                    if (password) {
                        password.focus();
                    } else {
                        var username = find(USERNAME_FIELDS, loginForm);
                        if (username) {
                            username.focus();
                        }
                    }
                }
            });
        }

        // finished filling things successfully
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
        var result = [];
        for (var i = 0; i < field.selectors.length; i++) {
            var elems = parent.querySelectorAll(field.selectors[i]);
            for (var j = 0; j < elems.length; j++) {
                var elem = elems[j];
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
                var style = window.getComputedStyle(elem);
                if (style.visibility == "hidden") {
                    continue;
                }
                // Elem is outside of the boundaries of the visible viewport.
                var rect = elem.getBoundingClientRect();
                if (
                    rect.x + rect.width < 0 ||
                    rect.y + rect.height < 0 ||
                    (rect.x > window.innerWidth || rect.y > window.innerHeight)
                ) {
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
     * @return The login form
     */
    function form() {
        var elems = queryAllVisible(document, INPUT_FIELDS, undefined);
        var forms = [];
        for (var i = 0; i < elems.length; i++) {
            var form = elems[i].form;
            if (form && forms.indexOf(form) < 0) {
                forms.push(form);
            }
        }
        if (forms.length == 0) {
            return undefined;
        }
        if (forms.length == 1) {
            return forms[0];
        }

        // If there are multiple forms, try to detect which one is a login form
        var formProps = [];
        for (var i = 0; i < forms.length; i++) {
            var form = forms[i];
            var props = [form.id, form.name, form.className];
            formProps.push(props);
            for (var j = 0; j < FORM_MARKERS.length; j++) {
                var marker = FORM_MARKERS[j];
                for (var k = 0; k < props.length; k++) {
                    var prop = props[k];
                    if (prop.toLowerCase().indexOf(marker) > -1) {
                        return form;
                    }
                }
            }
        }

        console.error(
            "Unable to detect which of the multiple available forms is the login form. Please submit an issue for browserpass on github, and provide the following list in the details: " +
                JSON.stringify(formProps)
        );
        return forms[0];
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
        if (!value.length) {
            return false;
        }

        // Focus the input element first
        var el = find(field, form);
        if (!el) {
            return false;
        }
        var eventNames = ["click", "focus"];
        eventNames.forEach(function(eventName) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        });

        // Focus may have triggered unvealing a true input, find it again
        el = find(field, form);
        if (!el) {
            return false;
        }

        // Now set the value and unfocus
        el.setAttribute("value", value);
        el.value = value;
        var eventNames = ["keypress", "keydown", "keyup", "input", "blur", "change"];
        eventNames.forEach(function(eventName) {
            el.dispatchEvent(new Event(eventName, { bubbles: true }));
        });
        return true;
    }

    // set window object
    window.browserpass = {
        fillLogin: fillLogin
    };
})();
