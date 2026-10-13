const assert = require("node:assert/strict");
const api = require("../src/utils/apiValidation");

assert.equal(typeof api.normaliseText, "function");
assert.equal(typeof api.isValidEmail, "function");
assert.equal(typeof api.sendError, "function");

assert.equal(api.normaliseText("  hello  "), "hello");
assert.equal(api.isValidEmail("test@example.com"), true);
assert.equal(api.isValidEmail("bad-email"), false);

console.log("baseline validation checks passed");
