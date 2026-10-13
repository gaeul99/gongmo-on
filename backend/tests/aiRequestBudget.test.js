const assert = require("node:assert/strict");
const { estimateAnalysisBudget } = require("../src/services/ai.service");

const body = {
  idea: {
    title: "AI 기반 공모전 추천 서비스",
    description: "학생들이 쉽고 빠르게 맞는 공모전을 찾도록 돕는 서비스",
    category: "교육",
  },
  referenceCases: [
    { id: 1, title: "예시", organizer: "테스트", domain: "교육" },
  ],
  contests: [
    {
      id: 1,
      title: "예시 공모전",
      organizer: "테스트",
      field: "교육",
      deadline: "2026-12-31",
    },
  ],
};

const budget = estimateAnalysisBudget(body);
assert.equal(typeof budget.totalItems, "number");
assert.equal(budget.tooLarge, false);

const oversized = estimateAnalysisBudget({
  ...body,
  referenceCases: Array.from({ length: 200 }, (_, index) => ({
    id: index + 1,
    title: "예시",
    organizer: "테스트",
    domain: "교육",
  })),
  contests: Array.from({ length: 200 }, (_, index) => ({
    id: index + 1,
    title: "예시",
    organizer: "테스트",
    field: "교육",
    deadline: "2026-12-31",
  })),
});
assert.equal(oversized.tooLarge, true);

console.log("ai request budget checks passed");
