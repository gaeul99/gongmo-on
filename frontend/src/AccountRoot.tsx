import { useSyncExternalStore } from 'react'
import App from './App'
import { subscribeAccountChanges, getAccountRevision } from './services/accountStorage'

export default function AccountRoot({ storageReady }: { storageReady: boolean }) {
  const revision = useSyncExternalStore(subscribeAccountChanges, getAccountRevision)
  if (!storageReady) return <main role="alert" style={{ padding: 32 }}>브라우저 저장소를 사용할 수 없어요. 저장 공간과 접근 설정을 확인한 뒤 새로고침해 주세요. 기존 기록은 보관되어 있습니다.</main>
  return <App key={revision} />
}
