import type { Coordinate } from '../types'
import { supabase } from './supabase'

export interface Profile {
  id: string
  handle: string
  name: string
}

export interface Friend {
  profile: Profile
  isEmergency: boolean
}

export interface RoomSummary {
  id: string
  is_group: boolean
  name: string | null
  member_names: string[]
  member_count: number
  last_body: string | null
  last_kind: MessageKind | null
  last_at: string | null
}

export interface RoomDetail {
  id: string
  isGroup: boolean
  name: string | null
  members: Profile[]
}

export type MessageKind = 'text' | 'auto' | 'system'

export interface Message {
  id: string
  sender_id: string | null
  kind: MessageKind
  body: string
  lat: number | null
  lng: number | null
  created_at: string
  sender: { name: string } | null
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return data as T
}

export function roomTitle(room: { name: string | null; member_names: string[] }) {
  if (room.name) return room.name
  return room.member_names.length > 0 ? room.member_names.join(', ') : '(대화 상대 없음)'
}

export const kakaoMapLink = (lat: number, lng: number) => `https://map.kakao.com/link/map/마지막위치,${lat},${lng}`

// ── 친구 ──

export async function listFriends(): Promise<Friend[]> {
  const rows = unwrap(
    await supabase
      .from('friendships')
      .select('is_emergency, friend:profiles!friendships_friend_id_fkey(id, handle, name)')
      .order('created_at'),
  ) as unknown as { is_emergency: boolean; friend: Profile }[]
  return rows.map((r) => ({ profile: r.friend, isEmergency: r.is_emergency }))
}

const SEARCH_LIMIT = 20

// 아이디는 정확히 일치, 이름은 부분 일치로 찾는다. 나 자신은 제외.
export async function searchProfiles(query: string, myId: string): Promise<Profile[]> {
  const handle = query.toLowerCase().replace(/^@/, '')
  // ilike 와일드카드로 해석되지 않도록 사용자가 입력한 %, _, \ 는 이스케이프
  const namePattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  const [byHandle, byName] = await Promise.all([
    supabase.from('profiles').select('id, handle, name').eq('handle', handle).neq('id', myId),
    supabase.from('profiles').select('id, handle, name').ilike('name', namePattern).neq('id', myId).order('name').limit(SEARCH_LIMIT),
  ])

  const merged = [...unwrap(byHandle), ...unwrap(byName)] as Profile[]
  return merged.filter((p, i) => merged.findIndex((q) => q.id === p.id) === i).slice(0, SEARCH_LIMIT)
}

export async function addFriend(friendId: string) {
  unwrap(await supabase.from('friendships').insert({ friend_id: friendId }))
}

export async function removeFriend(friendId: string) {
  unwrap(await supabase.from('friendships').delete().eq('friend_id', friendId))
}

export async function setEmergency(friendId: string, isEmergency: boolean) {
  unwrap(await supabase.from('friendships').update({ is_emergency: isEmergency }).eq('friend_id', friendId))
}

// ── 대화방 ──

export async function listRooms(): Promise<RoomSummary[]> {
  return unwrap(await supabase.rpc('list_my_rooms'))
}

export async function getRoom(roomId: string): Promise<RoomDetail | null> {
  const row = unwrap(
    await supabase
      .from('rooms')
      .select('id, is_group, name, room_members(profile:profiles(id, handle, name))')
      .eq('id', roomId)
      .maybeSingle(),
  ) as unknown as { id: string; is_group: boolean; name: string | null; room_members: { profile: Profile }[] } | null
  if (!row) return null
  return { id: row.id, isGroup: row.is_group, name: row.name, members: row.room_members.map((m) => m.profile) }
}

export async function getOrCreateDm(friendId: string): Promise<string> {
  return unwrap(await supabase.rpc('get_or_create_dm', { p_friend_id: friendId }))
}

export async function createGroupRoom(name: string, memberIds: string[]): Promise<string> {
  return unwrap(await supabase.rpc('create_group_room', { p_name: name, p_member_ids: memberIds }))
}

export async function inviteToRoom(roomId: string, memberIds: string[]) {
  unwrap(await supabase.rpc('invite_to_room', { p_room_id: roomId, p_member_ids: memberIds }))
}

export async function leaveRoom(roomId: string) {
  unwrap(await supabase.rpc('leave_room', { p_room_id: roomId }))
}

// ── 메시지 ──

export async function listMessages(roomId: string): Promise<Message[]> {
  return unwrap(
    await supabase
      .from('messages')
      .select('id, sender_id, kind, body, lat, lng, created_at, sender:profiles(name)')
      .eq('room_id', roomId)
      .order('created_at'),
  ) as unknown as Message[]
}

export async function sendMessage(roomId: string, body: string) {
  unwrap(await supabase.from('messages').insert({ room_id: roomId, body }))
}

// 비상 연락망 친구 각각의 1:1방으로 발송하고 받은 사람 수를 돌려준다.
export async function sendAutoAlert(body: string, coord: Coordinate | null): Promise<number> {
  return unwrap(
    await supabase.rpc('send_auto_alert', { p_body: body, p_lat: coord?.lat ?? null, p_lng: coord?.lng ?? null }),
  )
}
