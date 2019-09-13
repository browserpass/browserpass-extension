Browserpass Privacy Policy
==========================

## Definitions

 - Browserpass means the WebExtension at https://github.com/browserpass/browserpass-extension
 - Browserpass OTP means the WebExtension at https://github.com/browserpass/browserpass-otp
 - User means the user of the web browser where Browserpass or Browserpass OTP is installed.
 - Password Store means one or more locations on disk where the user stores encrypted credential files.
 - Credential File(s) means the individual credential files in the User's password store.
 - Developer(s) means the individuals who are responsible for the development of Browserpass and Browserpass OTP.

## Applicability

This Privacy Policy applies to Browserpass and Browserpass OTP.

## Usage of Credential Files

During the course of normal operation, Browserpass handles decrypted Credential Files.
Only files selected by the User via the Browserpass interface are decrypted.

The contents of decrypted Credential Files are used *only* for the following purposes:

 - To copy login credentials to the clipboard;
 - To automatically fill login credentials into a website in the current tab;
 - To provide the User with an interface to edit the contents of a selected Credential File,
 - To provide the OTP seed to Browserpass OTP
 - To fill other fields as requested by the User (e.g. credit card data)

## Use & Transmission of Data

Browserpass will fill data selected by the User to the website in the currently
active browser tab. This implies that data will be sent to that site when the
form into which the data has been filled is submitted.

If the form fields detected by Browserpass belong to a foreign origin, Browserpass
will prompt the User to confirm whether they would like to continue filling those
fields.

If an OTP seed is detected in a credential file when it is decrypted, it will be
passed to Browserpass OTP.

Browserpass only holds the decrypted contents of Credential Files while they are
actively being used by the User. Once the action selected by the User has been
completed, the data becomes out of scope, and will be cleaned up by the browser's
garbage collection mechanism.

Browserpass contains an autosubmit feature, which defaults to disabled. If enabled by
the user, this will cause Browserpass to automatically submit the form into which
credentials were filled immediately after filling. The Developers do not recommend
use of this feature, and it will never be enabled by default.

Browserpass OTP will, upon receipt of an OTP seed from Browserpass, generate an OTP
code and make it available on demand via the Browserpass OTP popup interface. If
Browserpass is not already using the clipboard, it will also place that code on the
clipboard.

Browserpass OTP will retain the OTP seed until the tab for which the seed applies is
navigated to a different origin, so that it can generate new codes as needed (typically
every 30 seconds).

IN NO EVENT WILL BROWSERPASS OR BROWSERPASS OTP EVER SEND DATA OF ANY KIND TO ANY PARTY
OTHER THAN A WEBSITE INTO INTO WHICH THE USER HAS DELIBERATELY REQUESTED BROWSERPASS
TO FILL DATA.

## Security of Transmission

Filled content will be submitted via whatever mechanism is provided by the form that
has been filled. This is determined by the website to which the form belongs. For clarity,
please note that some sites do not properly secure such forms - Browserpass will prompt
the User before filling data into any non-https origin.

Some websites may use a secure origin, but transmit data via insecure means. It is possible
that Browserpass may not be able to detect all such sites, so filling and submitting
data is done solely at the User's own risk.

## Local Storage

Browserpass may store the following via the browser's local storage API:

 - Historical usage data, in order to sort the list of Credential Files in the Browserpass
   popup interface by recency and usage count.
 - Usage of any given Credential File on an origin that cannot be automatically matched.
 - Responses to confirmation prompts.

Local storage may be cleared via the Browserpass options screen.

Decrypted contents of Credential Files are never placed in local storage for any reason.

## Further Detail

For further detail on how Browserpass functions and protects your data, please see the
readme at https://github.com/browserpass/browserpass-extension/blob/master/README.md.

## Liability

THE SOFTWARE IS PROVIDED "AS IS" AND THE DEVELOPERS DISCLAIM ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE DEVELOPERS BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
