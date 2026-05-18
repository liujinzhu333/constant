/**
 * 人际关系字典
 *
 * 数据结构：
 *   RelationGroup  —— 一类关系（如"父子/父女"）
 *     .name        —— 关系名称（展示用）
 *     .category    —— 所属大类（亲属 / 社交 / 职场）
 *     .pairs       —— 称谓对列表
 *
 *   RelationPair   —— 一个称谓对
 *     .label       —— 我叫 TA 的称谓
 *     .reverse     —— TA 叫我的称谓
 *
 * 使用方式：
 *   1. 用户选择关系组（如"父子/父女"）
 *   2. 从该组的 pairs 里选正向称谓（.label）
 *   3. 反向称谓（.reverse）自动填入，可手动覆盖
 */

export type RelationCategory = '直系亲属' | '旁系亲属' | '姻亲' | '社交' | '职场'

export interface RelationPair {
  label: string     // 我叫 TA
  reverse: string   // TA 叫我
}

export interface RelationGroup {
  name: string
  category: RelationCategory
  pairs: RelationPair[]
}

export const RELATION_DICT: RelationGroup[] = [
  // ── 直系亲属 ──────────────────────────────────────────────────
  {
    name: '父母 / 子女',
    category: '直系亲属',
    pairs: [
      { label: '父亲', reverse: '儿子' },
      { label: '爸爸', reverse: '儿子' },
      { label: '爸',   reverse: '儿子' },
      { label: '母亲', reverse: '女儿' },
      { label: '妈妈', reverse: '女儿' },
      { label: '妈',   reverse: '女儿' },
      { label: '儿子', reverse: '父亲' },
      { label: '女儿', reverse: '父亲' },
    ],
  },
  {
    name: '祖父母 / 孙辈',
    category: '直系亲属',
    pairs: [
      { label: '爷爷', reverse: '孙子' },
      { label: '奶奶', reverse: '孙子' },
      { label: '外公', reverse: '外孙' },
      { label: '外婆', reverse: '外孙' },
      { label: '姥爷', reverse: '外孙' },
      { label: '姥姥', reverse: '外孙' },
      { label: '孙子', reverse: '爷爷' },
      { label: '孙女', reverse: '奶奶' },
      { label: '外孙', reverse: '外公' },
      { label: '外孙女', reverse: '外婆' },
    ],
  },
  {
    name: '兄弟',
    category: '直系亲属',
    pairs: [
      { label: '哥哥', reverse: '弟弟' },
      { label: '哥',   reverse: '弟弟' },
      { label: '弟弟', reverse: '哥哥' },
      { label: '弟',   reverse: '哥哥' },
    ],
  },
  {
    name: '姐妹',
    category: '直系亲属',
    pairs: [
      { label: '姐姐', reverse: '妹妹' },
      { label: '姐',   reverse: '妹妹' },
      { label: '妹妹', reverse: '姐姐' },
      { label: '妹',   reverse: '姐姐' },
    ],
  },
  {
    name: '兄弟姐妹（混合）',
    category: '直系亲属',
    pairs: [
      { label: '哥哥', reverse: '妹妹' },
      { label: '弟弟', reverse: '姐姐' },
      { label: '姐姐', reverse: '弟弟' },
      { label: '妹妹', reverse: '哥哥' },
    ],
  },

  // ── 旁系亲属 ──────────────────────────────────────────────────
  {
    name: '叔侄',
    category: '旁系亲属',
    pairs: [
      { label: '叔叔', reverse: '侄子' },
      { label: '叔',   reverse: '侄子' },
      { label: '伯伯', reverse: '侄子' },
      { label: '伯父', reverse: '侄子' },
      { label: '侄子', reverse: '叔叔' },
      { label: '侄女', reverse: '叔叔' },
    ],
  },
  {
    name: '舅甥',
    category: '旁系亲属',
    pairs: [
      { label: '舅舅', reverse: '外甥' },
      { label: '舅',   reverse: '外甥' },
      { label: '外甥', reverse: '舅舅' },
      { label: '外甥女', reverse: '舅舅' },
    ],
  },
  {
    name: '姑侄',
    category: '旁系亲属',
    pairs: [
      { label: '姑姑', reverse: '侄子' },
      { label: '姑',   reverse: '侄子' },
      { label: '姨',   reverse: '外甥' },
      { label: '阿姨', reverse: '外甥' },
      { label: '侄子', reverse: '姑姑' },
      { label: '侄女', reverse: '姑姑' },
    ],
  },
  {
    name: '表兄弟',
    category: '旁系亲属',
    pairs: [
      { label: '表哥', reverse: '表弟' },
      { label: '表弟', reverse: '表哥' },
    ],
  },
  {
    name: '表姐妹',
    category: '旁系亲属',
    pairs: [
      { label: '表姐', reverse: '表妹' },
      { label: '表妹', reverse: '表姐' },
    ],
  },
  {
    name: '表兄妹 / 表姐弟',
    category: '旁系亲属',
    pairs: [
      { label: '表哥', reverse: '表妹' },
      { label: '表姐', reverse: '表弟' },
      { label: '表弟', reverse: '表姐' },
      { label: '表妹', reverse: '表哥' },
    ],
  },
  {
    name: '堂兄弟',
    category: '旁系亲属',
    pairs: [
      { label: '堂哥', reverse: '堂弟' },
      { label: '堂弟', reverse: '堂哥' },
    ],
  },
  {
    name: '堂姐妹',
    category: '旁系亲属',
    pairs: [
      { label: '堂姐', reverse: '堂妹' },
      { label: '堂妹', reverse: '堂姐' },
    ],
  },

  // ── 姻亲 ──────────────────────────────────────────────────────
  {
    name: '夫妻',
    category: '姻亲',
    pairs: [
      { label: '丈夫', reverse: '妻子' },
      { label: '老公', reverse: '老婆' },
      { label: '妻子', reverse: '丈夫' },
      { label: '老婆', reverse: '老公' },
    ],
  },
  {
    name: '公婆 / 儿媳',
    category: '姻亲',
    pairs: [
      { label: '公公', reverse: '儿媳' },
      { label: '婆婆', reverse: '儿媳' },
      { label: '儿媳', reverse: '公公' },
    ],
  },
  {
    name: '岳父母 / 女婿',
    category: '姻亲',
    pairs: [
      { label: '岳父', reverse: '女婿' },
      { label: '岳母', reverse: '女婿' },
      { label: '女婿', reverse: '岳父' },
    ],
  },
  {
    name: '连襟 / 妯娌',
    category: '姻亲',
    pairs: [
      { label: '连襟', reverse: '连襟' },
      { label: '妯娌', reverse: '妯娌' },
    ],
  },

  // ── 社交 ──────────────────────────────────────────────────────
  {
    name: '朋友',
    category: '社交',
    pairs: [
      { label: '朋友', reverse: '朋友' },
      { label: '好友', reverse: '好友' },
      { label: '好朋友', reverse: '好朋友' },
      { label: '闺蜜', reverse: '闺蜜' },
      { label: '死党', reverse: '死党' },
      { label: '老友', reverse: '老友' },
      { label: '发小', reverse: '发小' },
    ],
  },
  {
    name: '同学',
    category: '社交',
    pairs: [
      { label: '同学', reverse: '同学' },
      { label: '室友', reverse: '室友' },
      { label: '学长', reverse: '学弟' },
      { label: '学姐', reverse: '学妹' },
      { label: '学弟', reverse: '学长' },
      { label: '学妹', reverse: '学姐' },
    ],
  },
  {
    name: '邻居',
    category: '社交',
    pairs: [
      { label: '邻居', reverse: '邻居' },
    ],
  },
  {
    name: '战友',
    category: '社交',
    pairs: [
      { label: '战友', reverse: '战友' },
    ],
  },

  // ── 职场 ──────────────────────────────────────────────────────
  {
    name: '同事',
    category: '职场',
    pairs: [
      { label: '同事', reverse: '同事' },
      { label: '合伙人', reverse: '合伙人' },
    ],
  },
  {
    name: '上下级',
    category: '职场',
    pairs: [
      { label: '老板', reverse: '员工' },
      { label: '老板娘', reverse: '员工' },
      { label: '上司', reverse: '下属' },
      { label: '领导', reverse: '下属' },
      { label: '员工', reverse: '老板' },
      { label: '下属', reverse: '上司' },
    ],
  },
  {
    name: '师徒',
    category: '职场',
    pairs: [
      { label: '老师', reverse: '学生' },
      { label: '师父', reverse: '徒弟' },
      { label: '师傅', reverse: '徒弟' },
      { label: '学生', reverse: '老师' },
      { label: '徒弟', reverse: '师父' },
    ],
  },
]

/** 所有大类（有序，用于分组展示） */
export const RELATION_CATEGORIES: RelationCategory[] = ['直系亲属', '旁系亲属', '姻亲', '社交', '职场']

/** 按大类分组的关系组 */
export const RELATION_DICT_BY_CATEGORY = RELATION_CATEGORIES.map(cat => ({
  category: cat,
  groups: RELATION_DICT.filter(g => g.category === cat),
}))

/**
 * 根据正向称谓快速查找反向称谓（全表搜索，用于兼容旧的文本输入）
 */
export function inferReverseLabel(label: string): string {
  const trimmed = label.trim()
  for (const group of RELATION_DICT) {
    const pair = group.pairs.find(p => p.label === trimmed)
    if (pair) return pair.reverse
  }
  return ''
}
