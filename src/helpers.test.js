var helpers = require("./helpers.js");

test("info", function() {
    var info = helpers.pathToHostInfo;
    expect(info("./dir/example.com/email@example.com", "example.com")).toStrictEqual({
        host: "example.com",
        isMatch: true
    });
    expect(info("./dir/example.com/sub.example.com", "example.com")).toStrictEqual({
        host: "sub.example.com",
        isMatch: false
    });
    expect(info("pi.hole", "pi.hole")).toStrictEqual({ host: "pi.hole", isMatch: true });
    expect(info("pi.hole", "local.pi.hole")).toStrictEqual({
        host: "pi.hole",
        isMatch: true
    });
    expect(info("pi.hole", "random.com")).toStrictEqual(null);
    expect(info("email@example.com", "example.com")).toStrictEqual(null);
    expect(info("example.com", "example.com:8080")).toStrictEqual({
        host: "example.com",
        isMatch: true
    });
    expect(info("example.com", "random.com")).toStrictEqual({
        host: "example.com",
        isMatch: false
    });
    expect(info("example.com", "sub.example.com:8080")).toStrictEqual({
        host: "example.com",
        isMatch: true
    });
    expect(info("example.com:8080", "example.com:8080")).toStrictEqual({
        host: "example.com:8080",
        isMatch: true
    });
    expect(info("example.com:1234", "example.com:8080")).toStrictEqual({
        host: "example.com:1234",
        isMatch: false
    });
    expect(info("example.com:8080", "example.com")).toStrictEqual({
        host: "example.com:8080",
        isMatch: false
    });
    expect(info("example.com:8080", "sub.example.com")).toStrictEqual({
        host: "example.com:8080",
        isMatch: false
    });
    expect(info("example.com:8080", "sub.example.com:8080")).toStrictEqual({
        host: "example.com:8080",
        isMatch: true
    });
});
