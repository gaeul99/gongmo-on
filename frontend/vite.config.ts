import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    open: true,
    watch: {
      // 공모전 이미지 갱신 중 파일 잠금(EBUSY)으로 서버가 종료되지 않도록 감시에서 제외합니다.
      ignored: ['**/public/contest/**'],
    },
  },
})
