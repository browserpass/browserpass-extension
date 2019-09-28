var helpers = require('./helpers.js')

test('pathToHost', function() {
    var pathToHost = helpers.pathToHost;
    expect(pathToHost('./dir/example.com/email@example.com', 'example.com')).toBe('example.com')
    expect(pathToHost('./dir/example.com/sub.example.com', 'example.com')).toBe('sub.example.com')
    expect(pathToHost('pi.hole', 'pi.hole')).toBe('pi.hole')
    expect(pathToHost('pi.hole', 'local.pi.hole')).toBe('pi.hole')
    expect(pathToHost('email@example.com', 'example.com')).toBe(null)
    expect(pathToHost('example.com', 'example.com:8080')).toBe('example.com')
    expect(pathToHost('example.com:8080', 'example.com:8080')).toBe('example.com:8080')
    expect(pathToHost('example.com:1234', 'example.com:8080')).toBe(null)
    expect(pathToHost('example.com:8080', 'example.com')).toBe(null)
})
