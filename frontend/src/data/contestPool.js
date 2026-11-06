import { fetchBackend } from '../services/backendConnection.js'
// ==========================================================
// 공모전 데이터 풀 — 목업 데이터 + 백엔드 자동 등록(스크래핑) 데이터
// 백엔드(contestSync 서비스)가 위비티·콘테스트코리아에서 주기적으로 수집한
// 공모전을 /api/contests로 내려주고, 앱은 시작 때 한 번 가져와
// mockData.js의 정제 데이터 뒤에 붙여 모든 화면에 내려준다.
// 같은 소스 게시물(콘테스트코리아 str_no·위비티 ix)이 양쪽에 있으면
// 정제된 목업 쪽(내려받은 포스터·다듬은 설명)을 남기고 자동 등록 쪽은 버린다.
// 백엔드가 꺼져 있으면 가져오기에 실패해도 목업 데이터만으로 화면이 그대로 동작한다.
// ==========================================================

import { useSyncExternalStore } from 'react'
import { contests as rawStaticContests } from './mockData.js'
import { normalizeContestText } from '../utils/displayText'

const staticContests = rawStaticContests.map(normalizeContestText)


// 목업 + 자동 등록 공모전이 공통으로 갖춘 형태. 자동 등록 데이터는 이 필드를 모두
// 채워 오며(applySteps·startDate는 상세를 못 읽은 경우에도 기본 문장으로 채워진다),
// TS 화면들이 이 타입으로 소비한다.
/**
 * @typedef {Object} PoolContest
 * @property {number} id
 * @property {string} title
 * @property {string} organizer
 * @property {string} field
 * @property {string} deadline
 * @property {string=} startDate
 * @property {string} eligibility
 * @property {Array<'teen'|'adult'>} ageGroups
 * @property {string} image
 * @property {string} url
 * @property {string} description
 * @property {string[]=} applySteps
 */

// 자동 등록 공모전(중복 제거 후 목업에 없던 것만).
/** @type {PoolContest[]} */
let syncedContests = []
// 공모전별 찜 사용자 수(인기도) — 백엔드가 사용자 데이터에서 집계해 준다.
// 실패해도 비어 있는 것(모두 0)으로 목록은 그대로 동작한다.
/** @type {Record<number, number>} */
let popularityById = {}
// 'idle' | 'loading' | 'ready' | 'failed' — 실패해도 목업 데이터로 화면은 유지된다.
let loadState = 'idle'
let version = 0
let inflight = null
const listeners = new Set()

// 병합 결과는 버전이 바뀔 때만 다시 만들어 참조를 유지한다 —
// useSyncExternalStore 소비자가 매 렌더 같은 배열을 받게 하기 위함.
/** @type {PoolContest[]} */
let mergedCache = staticContests

function emit() {
  version += 1
  mergedCache = buildMerged()
  for (const listener of listeners) listener()
}

// 소스 게시물을 가리키는 키. 자동 등록 데이터는 source·sourceId를 갖고 오고,
// 목업 데이터는 url에서 str_no(콘테스트코리아)·ix(위비티)를 찾아 같은 키로 만든다.
function sourceKeyOf(contest) {
  if (contest.source && contest.sourceId) return `${contest.source}:${contest.sourceId}`
  const url = String(contest.url ?? '')
  const ck = url.match(/str_no=(\d+)/)
  if (ck) return `contestkorea:${ck[1]}`
  const wv = url.match(/ix=(\d+)/)
  if (wv) return `wevity:${wv[1]}`
  return `url:${url}`
}

function buildMerged() {
  const known = new Set(staticContests.map(sourceKeyOf))
  const extra = syncedContests.filter((contest) => !known.has(sourceKeyOf(contest)))
  if (extra.length === 0) return staticContests
  return [...staticContests, ...extra]
}

/** 목업 + 자동 등록이 합쳐진 전체 공모전 목록. @returns {PoolContest[]} */
export function getAllContests() {
  return mergedCache
}

/** 자동 등록으로 추가된 건수(목업과 겹치지 않은 것만). */
export function getSyncedContestCount() {
  return mergedCache === staticContests ? 0 : mergedCache.length - staticContests.length
}

export function getContestPoolState() {
  return loadState
}

/** 공모전별 찜 사용자 수(인기도). 찜이 없거나 실패했으면 빈 객체. */
export function getPopularityById() {
  return popularityById
}

export function subscribeContestPool(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getContestPoolVersion() {
  return version
}

// 데이터가 도착했을 때 화면을 다시 그리게 하는 훅. 값은 버전별로 같은 배열 참조다.
export function useContestPool() {
  useSyncExternalStore(subscribeContestPool, getContestPoolVersion)
  return getAllContests()
}

/** 백엔드에서 자동 등록 공모전을 가져온다(앱 시작 때 한 번). */
export function loadSyncedContests() {
  if (loadState === 'loading') return inflight ?? Promise.resolve()
  loadState = 'loading'
  inflight = fetchBackend(`/api/contests`, { timeoutMs: 15_000 })
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return response.json()
    })
    .then((data) => {
      syncedContests = Array.isArray(data?.contests) ? data.contests.map(normalizeContestText) : []
      loadState = 'ready'
    })
    .catch(() => {
      // 백엔드가 꺼져 있어도 목업 데이터로 화면은 그대로 동작한다.
      loadState = 'failed'
    })
    .finally(() => {
      inflight = null
      emit()
    })
  // 인기도(찜 수)는 목록과 함께 가져오되 실패가 목록 로딩을 타지 않게 따로 잡는다.
  // 늦게 도착하면 emit으로 다시 그려지고, 실패하면 빈 집계(모두 0)로 남는다.
  fetchBackend(`/api/contests/popular`, { timeoutMs: 15_000 })
    .then((response) => (response.ok ? response.json() : { popular: [] }))
    .then((data) => {
      const next = {}
      for (const row of Array.isArray(data?.popular) ? data.popular : []) {
        const id = Number(row?.contestId)
        const count = Number(row?.count)
        if (Number.isFinite(id) && Number.isFinite(count)) next[id] = count
      }
      popularityById = next
    })
    .catch(() => {})
    .finally(() => {
      // 목록 로딩이 아직 끝나지 않았으면 목록 쪽 emit이 한 번에 그려 준다.
      if (loadState !== 'loading') emit()
    })
  return inflight
}
