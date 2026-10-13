const assert = require("node:assert/strict");
const {
  createSession,
  listSessionsForUser,
  deleteSession,
  deleteAccount,
  saveAccount,
  findAccount,
  hashPassword,
  makeSalt,
} = require("../src/services/userStore");

const nickname = "policy-user";
const salt = makeSalt();
saveAccount({
  nickname,
  salt,
  passwordHash: hashPassword("password123", salt),
  email: "policy@example.com",
  createdAt: new Date().toISOString(),
});

const tokens = Array.from({ length: 7 }, () => createSession(nickname));
const sessions = listSessionsForUser(nickname);
assert.equal(sessions.length, 5);
assert.equal(new Set(tokens).size, 7);
assert.equal(sessions.includes(tokens[0]), false);

const one = sessions[0];
deleteSession(one);
assert.equal(listSessionsForUser(nickname).length, 4);

deleteAccount(nickname);
assert.equal(findAccount(nickname), undefined);

console.log("session policy checks passed");
