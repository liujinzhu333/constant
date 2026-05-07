/**
 * Dream Mobile — AES-256 加解密工具
 * 复用 PC 端 dream/ 的加密策略（crypto-js AES-256）
 *
 * 移动端密钥管理策略：
 *   - App 端：密钥仅保存在内存（不持久化），用户解锁后注入
 *   - 密钥存储建议生产环境接入 Keychain（iOS）/ Keystore（Android）
 */

import CryptoJS from 'crypto-js'

// 内存中持有密钥（与 PC 端 account store 策略一致）
let _secretKey: string | null = null

export const cryptoUtil = {
  /** 设置密钥（用户解锁后调用，仅保存在内存） */
  setKey(key: string): void {
    _secretKey = key
  },

  /** 清除密钥（锁屏时调用） */
  clearKey(): void {
    _secretKey = null
  },

  /** 是否已解锁 */
  hasKey(): boolean {
    return _secretKey !== null
  },

  /**
   * 加密字符串
   * @param plaintext 明文
   * @param key 可选密钥（不传则使用内存密钥）
   */
  encrypt(plaintext: string, key?: string): string {
    const k = key ?? _secretKey
    if (!k) throw new Error('[Crypto] Key not set. Call setKey() first.')
    return CryptoJS.AES.encrypt(plaintext, k).toString()
  },

  /**
   * 解密字符串
   * @param ciphertext 密文
   * @param key 可选密钥
   */
  decrypt(ciphertext: string, key?: string): string {
    const k = key ?? _secretKey
    if (!k) throw new Error('[Crypto] Key not set. Call setKey() first.')
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, k)
      return bytes.toString(CryptoJS.enc.Utf8)
    } catch {
      return ''
    }
  },

  /**
   * 验证密钥是否正确（PC 端策略：取首条有密码的账号尝试解密，空字符串视为密钥错误）
   */
  verifyKey(sampleCiphertext: string, key: string): boolean {
    try {
      const result = this.decrypt(sampleCiphertext, key)
      return result.length > 0
    } catch {
      return false
    }
  },

  /** MD5 摘要（用于文件完整性校验） */
  md5(data: string): string {
    return CryptoJS.MD5(data).toString()
  },

  /** SHA256 摘要 */
  sha256(data: string): string {
    return CryptoJS.SHA256(data).toString()
  },
}
