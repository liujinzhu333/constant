import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export type MemberRelation = 'family' | 'relative' | 'friend' | 'colleague' | 'other'
export type MemberGender   = 'male' | 'female' | 'unknown'

export interface Member {
  id: string
  name: string
  nickname: string
  gender: MemberGender
  birth_date: string
  birth_lunar: string
  relation: MemberRelation
  relation_title: string
  phone: string
  email: string
  note: string
  tags: string         // JSON 字符串数组
  avatar_color: string
  created_at: number
  updated_at: number
}

export interface MemberEvent {
  id: string
  member_id: string
  event_date: string
  title: string
  content: string
  created_at: number
}

export interface MemberRelationRow {
  rel_id: string
  label: string
  rel_created_at: number
  id: string
  name: string
  nickname: string
  gender: MemberGender
  relation: MemberRelation
  relation_title: string
  avatar_color: string
  tags: string
}

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
  const members  = ref<Member[]>([])
  const allTags  = ref<string[]>([])
  const loading  = ref(false)

  const filterRelation = ref<MemberRelation | ''>('')
  const filterTag      = ref('')
  const filterKeyword  = ref('')

  const filteredMembers = computed(() => {
    let list = members.value
    if (filterRelation.value) list = list.filter(m => m.relation === filterRelation.value)
    if (filterTag.value) list = list.filter(m => {
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
        window.dreamAPI.member.list(),
        window.dreamAPI.member.allTags(),
      ])
      members.value = list as unknown as Member[]
      allTags.value = tags
    } finally {
      loading.value = false
    }
  }

  async function addMember(data: {
    name: string; nickname?: string; gender?: string
    birth_date?: string; birth_lunar?: string
    relation?: MemberRelation; relation_title?: string
    phone?: string; email?: string; note?: string
    tags?: string[]; avatar_color?: string
  }) {
    const created = await window.dreamAPI.member.add(JSON.parse(JSON.stringify(data)))
    members.value.unshift(created as unknown as Member)
    const newTags: string[] = JSON.parse((created as unknown as Member).tags || '[]')
    for (const t of newTags) if (!allTags.value.includes(t)) allTags.value.push(t)
  }

  async function updateMember(id: string, data: Partial<Member>) {
    const plain = JSON.parse(JSON.stringify(data))
    if (Array.isArray(plain.tags)) plain.tags = JSON.stringify(plain.tags)
    const updated = await window.dreamAPI.member.update(id, plain)
    const idx = members.value.findIndex(m => m.id === id)
    if (idx !== -1) members.value[idx] = updated as unknown as Member
  }

  async function deleteMember(id: string) {
    await window.dreamAPI.member.delete(id)
    members.value = members.value.filter(m => m.id !== id)
  }

  // ── Events ──
  const events        = ref<MemberEvent[]>([])
  const eventsLoading = ref(false)

  async function loadEvents(memberId: string) {
    eventsLoading.value = true
    try {
      events.value = await window.dreamAPI.member.eventList(memberId) as unknown as MemberEvent[]
    } finally {
      eventsLoading.value = false
    }
  }

  async function addEvent(data: { member_id: string; event_date?: string; title: string; content?: string }) {
    const created = await window.dreamAPI.member.eventAdd(JSON.parse(JSON.stringify(data)))
    events.value.unshift(created as unknown as MemberEvent)
  }

  async function deleteEvent(id: string) {
    await window.dreamAPI.member.eventDelete(id)
    events.value = events.value.filter(e => e.id !== id)
  }

  // ── Relations ──
  const relations        = ref<MemberRelationRow[]>([])
  const relationsLoading = ref(false)

  async function loadRelations(memberId: string) {
    relationsLoading.value = true
    try {
      relations.value = await window.dreamAPI.member.relationList(memberId) as unknown as MemberRelationRow[]
    } finally {
      relationsLoading.value = false
    }
  }

  async function addRelation(data: { from_id: string; to_id: string; label?: string }) {
    await window.dreamAPI.member.relationAdd(JSON.parse(JSON.stringify(data)))
    relations.value = await window.dreamAPI.member.relationList(data.from_id) as unknown as MemberRelationRow[]
  }

  async function deleteRelation(fromId: string, toId: string) {
    await window.dreamAPI.member.relationDelete(fromId, toId)
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
