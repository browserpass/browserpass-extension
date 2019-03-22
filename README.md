# Browserpass - browser extension

Browserpass is a browser extension for [zx2c4's pass](https://www.passwordstore.org/), a UNIX based password store manager. It allows you to auto-fill or copy to clipboard credentials for the current domain, protecting you from phishing attacks.

In order to use Browserpass you must also install a [companion native messaging host](https://github.com/browserpass/browserpass-native), which provides an interface to your password store.

![demo](https://user-images.githubusercontent.com/1177900/54850099-79227080-4ce6-11e9-9c94-d05ede9ee246.gif)

## Table of Contents

-   [Requirements](#requirements)
-   [Installation](#installation)
    -   [Verifying authenticity of the Github releases](#verifying-authenticity-of-the-github-releases)
-   [Updates](#updates)
-   [Usage](#usage)
    -   [Organizing password store](#organizing-password-store)
    -   [First steps in browser extension](#first-steps-in-browser-extension)
    -   [Available keyboard shortcuts](#available-keyboard-shortcuts)
    -   [Password matching and sorting](#password-matching-and-sorting)
    -   [Basic HTTP authentication](#basic-http-authentication)
    -   [Password store locations](password-store-locations)
-   [Options](#options)
-   [Security](#security)
-   [Privacy](#privacy)
-   [FAQ](#faq)
    -   [Why OTP is not supported?](#why-otp-is-not-supported)
    -   [How to use the same username and password pair on multiple domains](#how-to-use-the-same-username-and-password-pair-on-multiple-domains)
    -   [Hints for macOS users](#hints-for-macos-users)
    -   [Hints for NixOS / Nix users](#hints-for-nixos--nix-users)
-   [Contributing](#contributing)

## Requirements

-   The latest stable version of Chromium or Firefox, or any of their derivatives.
-   The latest stable version of gpg (having `pass` or `gopass` is actually not required).
-   A password store that follows certain [naming conventions](#organizing-password-store)

## Installation

In order to install Browserpass correctly, you have to install two of its components:

-   [Native messaging host](https://github.com/browserpass/browserpass-native#installation)
-   Browser extension for Chromium-based browsers (choose one of the options):
    -   Install the extension from [Chrome Web Store](https://chrome.google.com/webstore/detail/browserpass-ce/naepdomgkenhinolocfifgehidddafch) (which will provide auto-updates)
    -   Download `browserpass.crx` from the latest release and drag'n'drop it into `chrome://extensions` (remember to watch for new releases!).
    -   Download `chromium.zip`, unarchive and use `Load unpacked extension` in `chrome://extensions` in Developer mode.
-   Browser extension for Firefox-based browsers (choose one of the options):
    -   Install the extension from [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/browserpass-ce/) (which will provide auto-updates)
    -   Download `firefox.zip` from the latest release, unarchive and use `Load Temporary Add-on` on `about:debugging#addons` (remember the extension will be removed after browser is closed!).

### Verifying authenticity of the Github releases

All Github release files are signed with [this PGP key](https://keybase.io/maximbaz). To verify the signature of a given file, use `$ gpg --verify <file>.sig`.

It should report:

```
gpg: Signature made ...
gpg:                using RSA key 8053EB88879A68CB4873D32B011FDC52DA839335
gpg: Good signature from "Maxim Baz <...>"
gpg:                 aka ...
Primary key fingerprint: EB4F 9E5A 60D3 2232 BB52  150C 12C8 7A28 FEAC 6B20
     Subkey fingerprint: 8053 EB88 879A 68CB 4873  D32B 011F DC52 DA83 9335
```

## Updates

If you installed the extension from a webstore, you will receive updates automatically.

If not, repeat the installation instructions for the extension.

**IMPORTANT:** Majority of the improvements require changing code in both browser extensions and the [host application](https://github.com/browserpass/browserpass-native#updates). It is expected that you will make sure to keep both components up to date.

## Usage

### Organizing password store

Browserpass was designed with an assumption that certain conventions are being followed when organizing your password store.

1. In order to benefit of phishing attack protection, a password entry file, or any of its parent folders, must contain a full domain name (including TLD like `.com`) in their name.

    Some good examples:

    ```
    ~/.password-store/
        accounts.google.com.gpg
        amazon.com.gpg
        github.com/
            personal.gpg
            work.gpg
    ```

1. Password must be defined on a line starting from `password:`, `pass:` or `secret:` (case-insensitive), and if all of these are absent, the first line in the password entry file is considered to be a password.

1. Username must be defined on a line starting from `login:`, `username:`, `user:` or `email:` (case-insensitive), and if all of these are absent, the file name is considered to be a username.

1. URL ([only](#password-matching-and-sorting) used for [basic HTTP auth](#basic-http-authentication)!) must be defined on a line starting from `url:`, `uri:`, `website:`, `site:`, `link:` or `launch:` (case-insensitive).

### First steps in browser extension

Click on the icon or use <kbd>Ctrl+Shift+L</kbd> to open Browserpass with the entries that match current domain.

How to change the shortcut:

-   Chromium: `chrome://extensions/shortcuts`
-   Firefox: `about:addons` > Gear icon > `Manage Extension Shortcuts`

When Browserpass shows entries for a specific domain, you will see a badge with the domain name in the search input field:

![image](https://user-images.githubusercontent.com/1177900/54785353-52046a00-4c26-11e9-8497-8dc50701ddc4.png)

If you want to intentionally disable phishing attacks protection and search credentials in the entire password store, you must press <kbd>Backspace</kbd> to confirm this decision (domain badge will disappear), then use Browserpass normally.

### Available keyboard shortcuts

Note: If the cursor is located in the search input field, every shortcut that works on the selected entry will be applied on the first entry in the popup list.

| Shortcult                                            | Action                                        |
| ---------------------------------------------------- | --------------------------------------------- |
| <kbd>Ctrl+Shift+L</kbd>                              | open Browserpass popup                        |
| <kbd>Enter</kbd>                                     | submit form with these credentials ()         |
| Arrow keys and <kbd>Tab</kbd> / <kbd>Shift+Tab</kbd> | navigate popup list                           |
| <kbd>Ctrl+C</kbd>                                    | copy password to clipboard                    |
| <kbd>Ctrl+Shift+C</kbd>                              | copy username to clipboard                    |
| <kbd>Ctrl+G</kbd>                                    | open URL in the current tab                   |
| <kbd>Ctrl+Shift+G</kbd>                              | open URL in the new tab                       |
| <kbd>Backspace</kbd>                                 | search passwords in the entire password store |

### Password matching and sorting

When you first open Browserpass popup, you will see a badge with the current domain name in the search input field:

![image](https://user-images.githubusercontent.com/1177900/54785353-52046a00-4c26-11e9-8497-8dc50701ddc4.png)

This means that phishing attack prevention is enabled, and Browserpass is only showing you entries from your password store that match this domain.

In order for Browserpass to correctly determine matching entries, it is expected that your password store follows naming conventions (see [Organizing password store](#organizing-password-store)), in particular your file or folder name must contain TLD, i.e. not `github.gpg`, but `github.com.gpg`. If an attacker directed you to `https://github.co/login` (notice `.co`), Browserpass will **not** present `github.com` entry in the popup. However if you intentionally want to re-use the same credentials on multiple domains (e.g. `amazon.com` and `amazon.co.uk`), see [How to use the same username and password pair on multiple domains](#how-to-use-the-same-username-and-password-pair-on-multiple-domains).

Browserpass will display entries for the current domain, as well as all parent entries, but not entries from different subdomains. Suppose you are currently on `https://v3.app.example.com`, Browserpass will present all the following entries in popup (if they exist): `v3.app.example.com`, `app.example.com`, `example.com`; but it will not present entries like `v2.app.example.com` or `wiki.example.com`.

Finally Browserpass will also present entries that you have recently used on this domain, even if they don't belong to this domain. Suppose you have a password for `amazon.com`, but you open `https://amazon.co.uk`, at first Browserpass will present no entries (because nothing matches `amazon.co.uk`), but if you hit <kbd>Backspace</kbd>, find `amazon.com` and use it to login, next time you visit `https://amazon.co.uk` and open Browserpass, `amazon.com` entry will already be present.

The sorting algorithm implemented in Browserpass will use several intuitions to try to order results in the most expected way for a user:

1. If Browserpass was previously used on this domain, the first entry in the list will always be the most recently used one.
1. The rest of the available password entries will be sorted by the frequency of their usage, the more times a password was used, the higher it will be in the list.
1. Password entries with the identical usage counts are sorted by number of domain levels (specificity), i.e. `wiki.example.com` will be above `example.com`.
1. If all the above is equal, password entries are sorted alphabetically.

### Basic HTTP authentication

Due to the way browsers are implemented, browser extensions are only able to fill basic HTTP auth credentials for a website if these websites were opened by the extension. For this reason alone Browserpass contains a functionality to open a URL associated with a password entry in the current or a new browser tab.

If you want Browserpass to fill out basic HTTP auth credentials, you must open these websites using Browserpass.

### Password store locations

Browserpass is able to automatically detect your password store location: it first checks `PASSWORD_STORE_DIR` environment variable, if it is not defined it falls back to `$HOME/.password-store`.

Using `Custom store locations` setting in the browser extension options you are able to define one or multiple locations for password stores: there are no restrictions, it can be subfolders in the password store, gopass mounts or any other folder that contains password entries.

## Options

The list of available options:

| Name                                                        | Description                                                  |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| Automatically submit forms after filling (aka `autoSubmit`) | make Browserpass automatically submit the login form for you |
| Custom gpg binary (aka `gpgPath`)                           | path to a custom `gpg` binary to use                         |
| Custom store locations                                      | list of password stores to use                               |

Browserpass allows configuring certain settings in different places places using the following priority, highest first:

1. Options defined in specific `*.gpg` files, only apply to these password entries:
    - `autoSubmit`
1. Options defined in browser extension options:
    - Automatically submit forms after filling (aka `autoSubmit`)
    - Custom gpg binary (aka `gpgPath`)
    - Custom store locations
1. Options defined in `.browserpass.json` file located in the root of a password store:
    - `autoSubmit`
    - `gpgPath`

## Security

Browserpass aims to protect your passwords and computer from malicious or fraudulent websites.

-   To protect against phishing, only passwords matching the origin hostname are suggested or selected without an explicit search term.
-   To minimize attack surface, the website is not allowed to trigger any extension action without user invocation.
-   Only data from the selected password is made available to the website.
-   Given full control of the non-native component of the extension, the attacker can extract passwords stored in the configured repository, but can not obtain files elsewhere on the filesystem or reach code execution.
-   Browserpass does not attempt to secure the data it stores in browser local storage, it is assumed that users take precautions to protect their local file system (e.g. by using disk encryption)

## Privacy

Browserpass does not send any telemetry data, all metadata it collects to perform its functionality is stored in local storage and never leaves your browser.

## FAQ

### How to use the same username and password pair on multiple domains

There are several ways to tell Browserpass to use the same pair of credentials on multiple domains, for example how to re-use an existing password entry `amazon.com.gpg` on a `https://amazon.co.uk` website without duplicating your credentials in multiple password files.

The first option is just to manually find the desired credentials and use them in Browserpass, in other words if you have credentials for `amazon.com`, but you are currently on `https://amazon.co.uk`, open Browserpass, hit <kbd>Backspace</kbd> to search the entire password store, find `amazon.com` and hit <kbd>Enter</kbd> to login. Next time you will open Browserpass on `https://amazon.co.uk`, the popup will already contain the `amazon.com` entry, because it was previously used on this website (for details see [Password matching and sorting](#password-matching-and-sorting) section).

The second option is to create a symlink file `amazon.co.uk.gpg` pointing to `amazon.com.gpg` in your password store, not only Browserpass, but `pass` itself will both recognize the symlink as an existing password entry.

If you simply want to re-use the same credentials on multiple subdomains of the same domain (e.g. `app.example.com` and `wiki.example.com`), you can also rename your password entry to a common denominator of the two subdomains, which in this example would be `example.com.gpg` (see [Password matching and sorting](#password-matching-and-sorting)).

### Why OTP is not supported?

TODO

### Hints for macOS users

TODO

### Hints for NixOS / Nix users

TODO

## Contributing

TODO
