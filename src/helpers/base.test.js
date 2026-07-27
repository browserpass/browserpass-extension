"use strict";

const assert = require("assert");
const { makeTOTP } = require("./base");

const originalDateNow = Date.now;

try {
    Date.now = () => 59000;

    const shortSecret = "GEZDGNBV"; // Base32 for the five-byte ASCII string "12345".

    assert.strictEqual(
        makeTOTP({ algorithm: "sha1", digits: 8, period: 30, secret: shortSecret }),
        "56662488"
    );
    assert.strictEqual(
        makeTOTP({ algorithm: "sha256", digits: 8, period: 30, secret: shortSecret }),
        "51639141"
    );
    assert.strictEqual(
        makeTOTP({ algorithm: "sha512", digits: 8, period: 30, secret: shortSecret }),
        "96422252"
    );

    assert.strictEqual(
        makeTOTP({
            algorithm: "sha1",
            digits: 8,
            period: 30,
            secret: "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ",
        }),
        "94287082"
    );
} finally {
    Date.now = originalDateNow;
}
