/**
 * repositories/background.js — 背景素材持久化（OPFS 字节 + settings 描述符）
 *
 * 全仓唯一直接访问 navigator.storage.getDirectory() 的文件；视图/store
 * 只经本仓库。字节存根目录 jizhang-bg.bin，描述符键 uiBackground
 * 天然不命中 backup.js 的导出白名单。
 */

import { get, remove, set } from './settings'
import { normalizeDescriptor } from '@/services/background'

const FILE_NAME = 'jizhang-bg.bin'
const DESCRIPTOR_KEY = 'uiBackground'

export function opfsSupported() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.storage &&
    typeof navigator.storage.getDirectory === 'function'
  )
}

async function root() {
  if (!opfsSupported()) throw new Error('当前浏览器无法保存背景素材')
  return navigator.storage.getDirectory()
}

/** 启动时调一次：降低 OPFS 被系统回收的概率，失败不阻塞启动 */
export async function persist() {
  try {
    await navigator.storage.persist?.()
  } catch {
    // 持久化只是概率优化；失败时仍可读写，只是可能被回收
  }
}

export async function getDescriptor() {
  return normalizeDescriptor(await get(DESCRIPTOR_KEY, null))
}

export async function setDescriptor(descriptor) {
  await set(DESCRIPTOR_KEY, descriptor)
}

export async function clearDescriptor() {
  await remove(DESCRIPTOR_KEY)
}

export async function readBytes() {
  const dir = await root()
  try {
    const handle = await dir.getFileHandle(FILE_NAME)
    return await handle.getFile()
  } catch (err) {
    if (err && err.name === 'NotFoundError') return null
    throw err
  }
}

export async function writeBytes(blob) {
  const dir = await root()
  const handle = await dir.getFileHandle(FILE_NAME, { create: true })
  const writable = await handle.createWritable()
  try {
    await writable.write(blob)
  } finally {
    await writable.close()
  }
}

export async function removeBytes() {
  if (!opfsSupported()) return
  const dir = await root()
  try {
    await dir.removeEntry(FILE_NAME)
  } catch (err) {
    if (!err || err.name !== 'NotFoundError') throw err
  }
}
