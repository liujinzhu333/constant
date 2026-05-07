/**
 * Dream Mobile — 账号 Store
 * 对标 PC 端 dream/src/stores/account.ts
 *
 * 加密策略：密钥仅保存在内存（不持久化），用户解锁后注入
 * 移动端增强：支持 Face ID / 指纹 biometrics 解锁（通过 uni.checkIsSupportSoterAuthentication）
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { accountDao, type AccountItem } from '../utils/db'
import { cryptoUtil } from '../utils/crypto'
import { logger } from '../utils/logger'
import { bridgeBiometric } from '../utils/bridge'

export const ACCOUNT_TYPES = [
  { value: 'dev',      label: '开发工具', icon: '💻' },
  { value: 'social',   label: '社交媒体', icon: '💬' },
  { value: 'shopping', label: '购物',     icon: '🛒' },
  { value: 'finance',  label: '金融',     icon: '💰' },
  { value: 'game',     label: '游戏',     icon: '🎮' },
  { value: 'work',     label: '工作',     icon: '💼' },
  { value: 'media',    label: '音视频',   icon: '🎵' },
  { value: 'other',    label: '其他',     icon: '📦' },
] as const

export type AccountType = typeof ACCOUNT_TYPES[number]['value']

export const useAccountStore = defineStore('account', () => {
  const accounts = ref<AccountItem[]>([])
  const isUnlocked = ref(false)
  const selectedType = ref<AccountType | 'all'>('all')
  const loading = ref(false)

  /** 支持生物识别 */
  const supportsBiometrics = ref(false)

  const filteredAccounts = computed(() => {
    if (selectedType.value === 'all') return accounts.value
    return accounts.value.filter(a => a.type === selectedType.value)
  })

  /** 检测生物识别支持 */
  async function checkBiometrics() {
    try {
      const result = await bridgeBiometric.isAvailable()
      supportsBiometrics.value = result.available
    } catch {
      supportsBiometrics.value = false
    }
  }

  /** 生物识别解锁 */
  async function biometricUnlock(key: string): Promise<boolean> {
    try {
      const result = await bridgeBiometric.authenticate('验证以解锁账号管理')
      if (result.success) {
        cryptoUtil.setKey(key)
        isUnlocked.value = true
        return true
      }
      return false
    } catch {
      return false
    }
  }

  /** 密钥验证解锁 */
  async function unlock(key: string): Promise<boolean> {
    try {
      const all = await accountDao.list()
      // 找第一条有密码的记录验证
      const sample = all.find(a => a.password_encrypted)
      if (!sample) {
        // 无加密数据，直接解锁
        cryptoUtil.setKey(key)
        isUnlocked.value = true
        await loadAccounts()
        return true
      }
      const valid = cryptoUtil.verifyKey(sample.password_encrypted, key)
      if (valid) {
        cryptoUtil.setKey(key)
        isUnlocked.value = true
        await loadAccounts()
      }
      return valid
    } catch (err) {
      logger.error('AccountStore', 'unlock 失败', err)
      return false
    }
  }

  function lock() {
    cryptoUtil.clearKey()
    isUnlocked.value = false
    accounts.value = []
  }

  async function loadAccounts(type?: AccountType | 'all') {
    loading.value = true
    try {
      const t = type ?? selectedType.value
      accounts.value = await accountDao.list(t === 'all' ? undefined : t)
    } catch (err) {
      logger.error('AccountStore', 'loadAccounts 失败', err)
    } finally {
      loading.value = false
    }
  }

  async function addAccount(data: Omit<AccountItem, 'id' | 'created_at' | 'updated_at'>): Promise<number | undefined> {
    try {
      // 加密密码
      const encrypted = data.password_encrypted
        ? cryptoUtil.encrypt(data.password_encrypted)
        : ''
      const id = await accountDao.add({ ...data, password_encrypted: encrypted })
      await loadAccounts()
      return id
    } catch (err) {
      logger.error('AccountStore', 'addAccount 失败', err)
      console.error('[AccountStore] 添加失败', err)
    }
  }

  async function updateAccount(id: number, data: Partial<AccountItem>) {
    try {
      const patch = { ...data }
      if (patch.password_encrypted) {
        patch.password_encrypted = cryptoUtil.encrypt(patch.password_encrypted)
      }
      await accountDao.update(id, patch)
      await loadAccounts()
    } catch (err) {
      logger.error('AccountStore', `updateAccount id=${id} 失败`, err)
    }
  }

  async function removeAccount(id: number) {
    try {
      await accountDao.remove(id)
      accounts.value = accounts.value.filter(a => a.id !== id)
    } catch (err) {
      logger.error('AccountStore', `removeAccount id=${id} 失败`, err)
      console.error('[AccountStore] 删除失败', err)
    }
  }

  /** 解密密码（仅在界面展示时调用） */
  function decryptPassword(encrypted: string): string {
    if (!encrypted || !cryptoUtil.hasKey()) return ''
    return cryptoUtil.decrypt(encrypted)
  }

  function selectType(type: AccountType | 'all') {
    selectedType.value = type
    loadAccounts(type)
  }

  return {
    accounts, isUnlocked, selectedType, loading, supportsBiometrics,
    filteredAccounts, ACCOUNT_TYPES,
    checkBiometrics, biometricUnlock, unlock, lock,
    loadAccounts, addAccount, updateAccount, removeAccount,
    decryptPassword, selectType,
  }
})
