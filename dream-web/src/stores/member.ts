import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import {
  memberApi, memberEventApi, memberRelationApi,
  offlinePost, offlinePatch, offlineDelete,
  readCache, writeCache,
  type Member, type MemberEvent, type MemberRelationRow,
  type MemberRelation,
} from '../utils/api'
import { useConnectionStore } from './connection'

export type { Member, MemberEvent, MemberRelationRow, MemberRelation }

export const RELATION_LABELS: Record<MemberRelation, string> = {
  family:    '直系',
  relative:  '亲戚',
  friend:    '朋友',
  colleague: '同事',
  other:     '其他',
}

export const RELATION_OPTIONS = (Object.keys(RELATION_LABELS) as MemberRelation[]).map(k => ({
  value: k,
  label: RELATION_LABELS[k],
}))

const AVATAR_COLORS = [
  '#409EFF', '#67C23A', '#E6A23C', '#F56C6C',
  '#909399', '#9B59B6', '#1ABC9C', '#E74C3C',
]
export function randomAvatarColor(): string {
  return AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)]
}

export const useMemberStore = defineStore('member', () => {
  const members   = ref<Member[]>([])
  const allTags   = ref<string[]>([])
  const loading   = ref(false)

  // 筛选条件
  const filterRelation = ref<MemberRelation | ''>('')
  const filterTag      = ref('')
  const filterKeyword  = ref('')

  const filteredMembers = computed(() => {
    let list = members.value
    if (filterRelation.value) list = list.filter(m => m.relation === filterRelation.value)
    if (filterTag.value)      list = list.filter(m => {
      const tags: string[] = JSON.parse(m.tags || '[]')
      return tags.includes(filterTag.value)
    })
    if (filterKeyword.value) {
      const kw = filterKeyword.value.toLowerCase()
      list = list.filter(m =>
        m.name.toLowerCase().includes(kw) ||
        m.nickname.toLowerCase().includes(kw) ||
        m.relation_title.toLowerCase().includes(kw)
      )
    }
    return list
  })

  async function load() {
    loading.value = true
    try {
      const [list, tags] = await Promise.all([
        memberApi.list(),
        memberApi.allTags(),
      ])
      members.value = list
      allTags.value = tags
      writeCache('/api/members', list)
    } finally {
      loading.value = false
    }
  }

  // 向 connection store 注册刷新回调
  useConnectionStore().registerRefresh(load)

  // ── CRUD ──

  async function addMember(data: {
    name: string; nickname?: string; gender?: string
    birth_date?: string; birth_lunar?: string
    relation?: MemberRelation; relation_title?: string
    phone?: string; email?: string; note?: string
    tags?: string[]; avatar_color?: string
  }) {
    const body = {
      name:           data.name,
      nickname:       data.nickname       ?? '',
      gender:         data.gender         ?? 'unknown',
      birth_date:     data.birth_date     ?? '',
      birth_lunar:    data.birth_lunar    ?? '',
      relation:       data.relation       ?? 'other',
      relation_title: data.relation_title ?? '',
      phone:          data.phone          ?? '',
      email:          data.email          ?? '',
      note:           data.note           ?? '',
      tags:           data.tags           ?? [],
      avatar_color:   data.avatar_color   ?? randomAvatarColor(),
    }
    const t = Math.floor(Date.now() / 1000)
    const created = await offlinePost<Member>(
      '/api/members',
      body,
      (tempId) => ({
        id: tempId,
        ...body,
        tags: JSON.stringify(body.tags),
        created_at: t,
        updated_at: t,
      } as Member),
    )
    members.value.unshift(created)
    // 手动更新缓存（key 无查询参数）
    writeCache('/api/members', members.value)
    // 更新标签列表
    const newTags: string[] = JSON.parse(created.tags || '[]')
    for (const tag of newTags) {
      if (!allTags.value.includes(tag)) allTags.value.push(tag)
    }
  }

  async function updateMember(id: string, data: Partial<Omit<Member, 'id' | 'created_at' | 'updated_at'>>) {
    const current = members.value.find(m => m.id === id)
    if (!current) return
    // tags 需序列化
    const patch: Record<string, unknown> = { ...data }
    if (Array.isArray(data.tags)) patch.tags = JSON.stringify(data.tags)
    const updated = await offlinePatch<Member>(`/api/members/${id}`, patch, current)
    const idx = members.value.findIndex(m => m.id === id)
    if (idx !== -1) members.value[idx] = updated
    writeCache('/api/members', members.value)
  }

  async function deleteMember(id: string) {
    await offlineDelete(`/api/members/${id}`)
    members.value = members.value.filter(m => m.id !== id)
    writeCache('/api/members', members.value)
  }

  // ── Events ──

  const events = ref<MemberEvent[]>([])
  const eventsLoading = ref(false)

  async function loadEvents(memberId: string) {
    eventsLoading.value = true
    try {
      events.value = await memberEventApi.list(memberId)
    } finally {
      eventsLoading.value = false
    }
  }

  async function addEvent(data: { member_id: string; event_date?: string; title: string; content?: string }) {
    const t = Math.floor(Date.now() / 1000)
    const created = await offlinePost<MemberEvent>(
      '/api/member-events',
      data,
      (tempId) => ({
        id: tempId,
        member_id:  data.member_id,
        event_date: data.event_date ?? '',
        title:      data.title,
        content:    data.content ?? '',
        created_at: t,
      }),
    )
    events.value.unshift(created)
  }

  async function deleteEvent(id: string) {
    await offlineDelete(`/api/member-events/${id}`)
    events.value = events.value.filter(e => e.id !== id)
  }

  // ── Relations ──

  const relations = ref<MemberRelationRow[]>([])
  const relationsLoading = ref(false)

  async function loadRelations(memberId: string) {
    relationsLoading.value = true
    try {
      relations.value = await memberRelationApi.list(memberId)
    } finally {
      relationsLoading.value = false
    }
  }

  async function addRelation(data: { from_id: string; to_id: string; label?: string; reverse_label?: string }) {
    await memberRelationApi.add(data)
    // 刷新关联列表（服务端双向写入后重新拉取）
    relations.value = await memberRelationApi.list(data.from_id)
  }

  async function deleteRelation(fromId: string, toId: string) {
    await memberRelationApi.delete(fromId, toId)
    // 从列表移除：rel_id 是 member_relations.id，to_id 是对方 member.id（即 r.id 字段）
    relations.value = relations.value.filter(r => r.id !== toId)
  }

  return {
    members, allTags, loading,
    filterRelation, filterTag, filterKeyword, filteredMembers,
    load, addMember, updateMember, deleteMember,
    events, eventsLoading, loadEvents, addEvent, deleteEvent,
    relations, relationsLoading, loadRelations, addRelation, deleteRelation,
  }
})
