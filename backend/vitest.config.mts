import { defineConfig } from "vitest/config";

// 단위 테스트는 src 안의 TS 테스트만 돌린다.
// tests/의 require 기반 레거시 스크립트(ts-node 수동 실행용)는
// 실제 데이터 파일(backend/src/data/*.json)을 직접 생성·삭제하므로
// 서버가 살아 있는 환경에서 함부로 자동 실행하면 안 된다.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
