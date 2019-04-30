module.exports = { extractFormData: extractFormData };

const USERNAME_KEYS = ["username", "user", "login"];
const EMAIL_KEYS = ["email", "e-mail"];
const PASSWORD_KEYS = ["password", "passwd", "pass", "secret"];

function findFormDataEntries(formData, keys) {
    let found = [];

    for (key in formData) {
	// strip keys of the form user[x]
        let strippedKey = key;
        let match = /\[.*\]/.exec(key);
        if (match) {
            strippedKey = key.substring(match.index + 1, match.index + match[0].length - 1);
        }

        if (keys.includes(strippedKey)) {
            let entry = formData[key];
            if (entry != "") found.push(entry[0]);
        }
    }

    return found;
}

function checkPasswords(passwords) {
    if (passwords.length < 2) return true;

    let compare = passwords[0];

    for (let password of passwords) {
        if (password != compare) return false;
    }

    return true;
}

function extractFormData(formData) {
    let passwords = findFormDataEntries(formData, PASSWORD_KEYS);
    let usernames = findFormDataEntries(formData, USERNAME_KEYS);
    let emails = findFormDataEntries(formData, EMAIL_KEYS);

    if (!checkPasswords(passwords)) return null;

    if (passwords.length === 0) return null;

    if (usernames.length === 0 && emails.length === 0) return null;

    let credentials = { password: passwords[0] };
    if (usernames.length > 0) {
        credentials.login = usernames[0];

        if (emails.length > 0) {
            credentials.email = emails[0];
        }
    } else {
        credentials.login = emails[0];
        credentials.email = "";
    }

    return credentials;
}
