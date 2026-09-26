import type { ChatMessage } from '../types'

export interface Friend {
  id: string
  name: string
  relation: string
  avatar: string
  online: boolean
}

const minutesAgo = (m: number) => Date.now() - m * 60_000

export const MOCK_FRIENDS: Friend[] = [
  { id: 'f1', name: '엄마', relation: '가족', avatar: '👩', online: true },
  { id: 'f2', name: '김지은', relation: '친구', avatar: '🧑', online: true },
  { id: 'f3', name: '박서준', relation: '룸메이트', avatar: '👦', online: false },
  { id: 'f4', name: '이하늘', relation: '직장 동료', avatar: '👧', online: false },
]

export const MOCK_CONVERSATIONS: Record<string, ChatMessage[]> = {
  f1: [
    { id: 'm1', author: 'f1', authorLabel: '엄마', text: '오늘 몇 시에 들어와?', timestamp: minutesAgo(180) },
    { id: 'm2', author: 'user', authorLabel: '나', text: '11시쯤? 출발할 때 경로 켜둘게', timestamp: minutesAgo(175) },
    { id: 'm3', author: 'system', authorLabel: '시스템', text: '🍞 귀가 경로 공유가 시작됐어요', timestamp: minutesAgo(60) },
    { id: 'm4', author: 'f1', authorLabel: '엄마', text: '조심히 와~', timestamp: minutesAgo(58) },
  ],
  f2: [
    { id: 'm1', author: 'system', authorLabel: '시스템', text: '⚠️ 체크인 미응답이 감지됐어요', timestamp: minutesAgo(1440) },
    { id: 'm2', author: 'f2', authorLabel: '김지은', text: '괜찮아? 연락 좀 줘!', timestamp: minutesAgo(1438) },
    { id: 'm3', author: 'user', authorLabel: '나', text: '지하철이라 신호가 끊겼어 ㅠ 괜찮아!', timestamp: minutesAgo(1430) },
    { id: 'm4', author: 'system', authorLabel: '시스템', text: '✅ 오탐으로 해제됐어요', timestamp: minutesAgo(1430) },
    { id: 'm5', author: 'f2', authorLabel: '김지은', text: '다행이다 ㅎㅎ', timestamp: minutesAgo(1428) },
  ],
  f3: [
    { id: 'm1', author: 'f3', authorLabel: '박서준', text: '현관 비번 바꿨어, 문자 확인해', timestamp: minutesAgo(4320) },
    { id: 'm2', author: 'user', authorLabel: '나', text: 'ㅇㅋ 고마워', timestamp: minutesAgo(4300) },
  ],
  f4: [],
}
