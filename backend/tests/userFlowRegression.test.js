const test = require("node:test");
const assert = require("node:assert/strict");
const {
  saveAccount,
  findAccount,
  createSession,
  getSessionUser,
  saveUserData,
  getUserData,
  deleteAccount,
  hashPassword,
  makeSalt,
  deleteSession,
} = require("../src/services/userStore");

const username = "flow-user";
const password = "password123";

function makeUser(nickname = username) {
  const salt = makeSalt();
  return {
    nickname,
    salt,
    passwordHash: hashPassword(password, salt),
    email: `${nickname}@example.com`,
    phone: "01012345678",
    createdAt: new Date().toISOString(),
  };
}

test("user flow: sign up, login session and saved data are restored", () => {
  const account = makeUser();
  saveAccount(account);
  assert.deepEqual(findAccount(username), account);

  const token = createSession(username);
  assert.equal(getSessionUser(token), username);

  const data = {
    myContests: [{ id: 1, title: "테스트 공모전", appliedAt: "2026-10-13" }],
    wishlist: [{ id: 2, title: "찜 공모전", deadline: "2026-11-01" }],
    savedIdeas: [
      { id: "idea-1", title: "테스트 아이디어", description: "AI 추천 서비스" },
    ],
    typeTest: { typeId: "inventive", percentage: 82, savedAt: "2026-10-13" },
    checklist: { step1: true },
    roadmaps: { 1: { checked: { step1: true }, updatedAt: "2026-10-13" } },
    practiceNotes: [{ id: "note-1", title: "연습 노트", content: "실험" }],
  };

  const record = saveUserData(username, data);
  assert.equal(record.data.myContests[0].title, "테스트 공모전");
  assert.deepEqual(getUserData(username), data);

  deleteSession(token);
  assert.equal(getSessionUser(token), undefined);
  deleteAccount(username);
  assert.equal(findAccount(username), undefined);
});
