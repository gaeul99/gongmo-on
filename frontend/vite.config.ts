import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 하위 경로 배포용 base — Pages 배포 워크플로가
  // VITE_BASE_PATH='/<저장소 이름>/'로 빌드한다. 로컬·Render는 '/' 그대로다.
  base: process.env.VITE_BASE_PATH || '/',
  server: {
    open: true,
    watch: {
      // 공모전 이미지 갱신 중 파일 잠금(EBUSY)으로 서버가 종료되지 않도록 감시에서 제외합니다.
      ignored: ['**/public/contest/**'],
    },
  },
})
