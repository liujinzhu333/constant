/**
 * 账号管理 Store
 *
 * 加密策略：
 *   - 密钥由用户在页面输入，仅保存在内存（secretKey ref），不持久化
 *   - 密码明文仅在内存中存在，写库前用 AES-256 加密，读库后按需解密
 *   - password_enc 字段存储密文；Account 对象中 password_plain 为解密后明文（可选）
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'
import CryptoJS from 'crypto-js'
import type { Account, AccountCategory } from '../../electron/preload/index'
export type { AccountCategory }

/** 带明文密码的前端扩展类型 */
export interface AccountWithPlain extends Account {
  password_plain?: string   // 解密成功后填充，失败时为 undefined
}

function encryptPassword(plain: string, key: string): string {
  return CryptoJS.AES.encrypt(plain, key).toString()
}

function decryptPassword(cipher: string, key: string): string | null {
  if (!cipher) return ''
  try {
    const bytes = CryptoJS.AES.decrypt(cipher, key)
    const result = bytes.toString(CryptoJS.enc.Utf8)
    return result || null   // 解密结果为空字符串视为密钥错误
  } catch {
    return null
  }
}

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<AccountWithPlain[]>([])
  /** 用户输入的全局密钥（内存持有，不持久化） */
  const secretKey = ref('')
  /** 密钥是否已验证（通过解密第一条记录判断） */
  const keyVerified = ref(false)
  const loading = ref(false)

  /** 设置密钥并尝试验证（若有记录则尝试解密第一条密码）*/
  function setSecretKey(key: string): boolean {
    secretKey.value = key
    if (accounts.value.length === 0) {
      keyVerified.value = true   // 无记录时直接认为密钥有效
      return true
    }
    // 找第一条有密码密文的记录做验证
    const sample = accounts.value.find(a => a.password_enc)
    if (!sample) {
      keyVerified.value = true
      return true
    }
    const result = decryptPassword(sample.password_enc, key)
    keyVerified.value = result !== null
    if (keyVerified.value) {
      // 验证成功后，解密所有记录
      accounts.value = accounts.value.map(a => ({
        ...a,
        password_plain: decryptPassword(a.password_enc, key) ?? undefined
      }))
    }
    return keyVerified.value
  }

  /** 清除密钥（锁定） */
  function clearKey() {
    secretKey.value = ''
    keyVerified.value = false
    // 清除内存中的明文密码
    accounts.value = accounts.value.map(a => ({ ...a, password_plain: undefined }))
  }

  /** 加载账号列表 */
  async function load() {
    loading.value = true
    try {
      const raw = await window.dreamAPI.account.list()
      accounts.value = raw.map(a => ({
        ...a,
        password_plain: keyVerified.value && secretKey.value
          ? (decryptPassword(a.password_enc, secretKey.value) ?? undefined)
          : undefined
      }))
    } finally {
      loading.value = false
    }
  }

  /** 新增账号 */
  async function addAccount(data: {
    platform: string
    platform_url?: string
    account_name?: string
    phone?: string
    email?: string
    password?: string   // 明文，Store 负责加密
    note?: string
    category?: AccountCategory
  }) {
    const password_enc = data.password && secretKey.value
      ? encryptPassword(data.password, secretKey.value)
      : ''
    const created = await window.dreamAPI.account.add({
      platform: data.platform,
      platform_url: data.platform_url,
      account_name: data.account_name,
      phone: data.phone,
      email: data.email,
      password_enc,
      note: data.note,
      category: data.category ?? 'other'
    })
    accounts.value.unshift({ ...created, password_plain: data.password })
  }

  /** 更新账号 */
  async function updateAccount(id: string, data: {
    platform?: string
    platform_url?: string
    account_name?: string
    phone?: string
    email?: string
    password?: string   // 明文，传 undefined 表示不改密码
    note?: string
    category?: AccountCategory
  }) {
    const patch: Record<string, string> = {}
    if (data.platform !== undefined) patch.platform = data.platform
    if (data.platform_url !== undefined) patch.platform_url = data.platform_url
    if (data.account_name !== undefined) patch.account_name = data.account_name
    if (data.phone !== undefined) patch.phone = data.phone
    if (data.email !== undefined) patch.email = data.email
    if (data.note !== undefined) patch.note = data.note
    if (data.category !== undefined) patch.category = data.category
    if (data.password !== undefined) {
      patch.password_enc = data.password && secretKey.value
        ? encryptPassword(data.password, secretKey.value)
        : ''
    }
    const updated = await window.dreamAPI.account.update(id, patch)
    const idx = accounts.value.findIndex(a => a.id === id)
    if (idx !== -1) {
      accounts.value[idx] = {
        ...updated,
        password_plain: data.password !== undefined ? data.password : accounts.value[idx].password_plain
      }
    }
  }

  /** 删除账号 */
  async function deleteAccount(id: string) {
    await window.dreamAPI.account.delete(id)
    accounts.value = accounts.value.filter(a => a.id !== id)
  }

  /** 解密单条密码（密钥正确时） */
  function decryptOne(cipher: string): string | null {
    if (!secretKey.value) return null
    return decryptPassword(cipher, secretKey.value)
  }

  return {
    accounts, secretKey, keyVerified, loading,
    setSecretKey, clearKey,
    load, addAccount, updateAccount, deleteAccount, decryptOne
  }
})
