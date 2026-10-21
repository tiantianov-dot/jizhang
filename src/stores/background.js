/**
 * stores/background.js — 上传背景素材的唯一状态源
 *
 * 优先级：相机 live（suspended）> 上传素材 > 默认星空。
 * 图片/GIF 走 --bg-image，视频走 BackgroundLayer；objectURL 生命周期只在这里。
 * OPFS 字节与 settings 描述符都经 repositories/background.js。
 */

import { defineStore } from 'pinia'
import { checkCoverResolution, validateMeta } from '@/services/background'
import * as repo from '@/repositories/background'

function setBgImage(value) {
  document.documentElement.style.setProperty('--bg-image', value)
}

/** 纯函数门所需的视口快照；services 保持零 DOM */
function currentView() {
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    dpr: window.devicePixelRatio,
    screenW: window.screen && window.screen.width,
    screenH: window.screen && window.screen.height,
    coarse:
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches,
  }
}

function probeImage(file) {
  return (async () => {
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(file)
      try {
        const width = Number(bitmap.width)
        const height = Number(bitmap.height)
        if (!(width > 0 && height > 0)) throw new Error('empty bitmap')
        return { width, height }
      } finally {
        bitmap.close?.()
      }
    }
    // 老 Safari 无 createImageBitmap：退化为 <img> 解码探针
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error('decode failed'))
        el.src = url
      })
      const width = Number(img.naturalWidth)
      const height = Number(img.naturalHeight)
      if (!(width > 0 && height > 0)) throw new Error('empty image')
      return { width, height }
    } finally {
      URL.revokeObjectURL(url)
    }
  })().catch(() => {
    throw new Error('无法解码该图片')
  })
}

function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video')
    if (!video.canPlayType(file.type)) {
      reject(new Error('无法解码该视频格式'))
      return
    }
    const url = URL.createObjectURL(file)
    let done = false
    const finish = (err) => {
      if (done) return
      done = true
      clearTimeout(timer)
      const dims = { width: video.videoWidth, height: video.videoHeight }
      URL.revokeObjectURL(url)
      video.removeAttribute('src')
      video.load?.()
      if (err) reject(err)
      else resolve(dims)
    }
    const timer = setTimeout(() => finish(new Error('无法解码该视频')), 8000)
    video.preload = 'metadata'
    video.muted = true
    video.onloadedmetadata = () => {
      if (video.videoWidth > 0 && video.videoHeight > 0) finish()
      else finish(new Error('无法解码该视频'))
    }
    video.onerror = () => finish(new Error('无法解码该视频'))
    video.src = url
  })
}

async function ensureCapacity(size) {
  if (!navigator.storage || typeof navigator.storage.estimate !== 'function') return
  let estimate
  try {
    estimate = await navigator.storage.estimate()
  } catch {
    return
  }
  if (estimate.quota && estimate.usage + size > estimate.quota) {
    throw new Error('存储空间不足：文件超过可用容量')
  }
}

export const useBackgroundStore = defineStore('background', {
  state: () => ({
    kind: 'starfield', // starfield | image | gif | video
    url: '',
    descriptor: null,
    suspended: false,
    videoReady: false,
    blocked: null, // { width, height, required: { width, height } }，仅内存
    notice: '',
  }),
  getters: {
    starfieldVisible: (s) => !s.suspended && s.kind === 'starfield',
  },
  actions: {
    revoke() {
      if (this.url) URL.revokeObjectURL(this.url)
      this.url = ''
    },

    /** data-bg / data-video-ready / --bg-image 的唯一写入点 */
    applyBackground() {
      const root = document.documentElement
      if (this.suspended) {
        setBgImage('none')
        delete root.dataset.bg
        this.resetVideoReady()
      } else if (this.kind === 'image' || this.kind === 'gif') {
        setBgImage(`url("${this.url}")`)
        root.dataset.bg = this.kind
        this.resetVideoReady()
      } else if (this.kind === 'starfield') {
        setBgImage('none')
        root.dataset.bg = 'starfield'
        this.resetVideoReady()
      } else {
        setBgImage('none')
        root.dataset.bg = 'video'
        this.resetVideoReady()
      }
    },

    markVideoReady() {
      if (this.suspended || this.kind !== 'video') return
      this.videoReady = true
      document.documentElement.setAttribute('data-video-ready', '')
    },

    resetVideoReady() {
      this.videoReady = false
      delete document.documentElement.dataset.videoReady
    },

    async load() {
      await repo.persist()
      let descriptor = null
      try {
        descriptor = await repo.getDescriptor()
      } catch {
        this.notice = '背景设置读取失败，已恢复默认星空'
      }
      if (!descriptor) {
        this.revoke()
        this.descriptor = null
        this.kind = 'starfield'
        this.blocked = null
        this.applyBackground()
        return
      }
      try {
        const blob = await repo.readBytes()
        if (!blob || blob.size !== descriptor.size) throw new Error('missing bytes')

        let dims = null
        if (descriptor.kind !== 'video') {
          dims =
            descriptor.width > 0 && descriptor.height > 0
              ? { width: descriptor.width, height: descriptor.height }
              : await probeImage(blob)
          const gate = checkCoverResolution(dims.width, dims.height, currentView())
          if (!gate.ok) {
            // 旧低分素材：保留 OPFS 字节与描述符，本次仅停用
            this.revoke()
            this.descriptor = descriptor
            this.kind = 'starfield'
            this.blocked = {
              width: dims.width,
              height: dims.height,
              required: { width: gate.width, height: gate.height },
            }
            this.notice = `现有背景分辨率不足（${dims.width}×${dims.height}），已暂用星空；请恢复星空后重新上传。`
            this.applyBackground()
            return
          }
        }

        this.revoke()
        // 补测出的宽高只放内存，不写回 IDB；下次启动重新判门
        this.descriptor = dims ? { ...descriptor, ...dims } : descriptor
        this.kind = descriptor.kind
        this.blocked = null
        this.url = URL.createObjectURL(blob)
        this.applyBackground()
      } catch {
        this.revoke()
        this.descriptor = null
        this.kind = 'starfield'
        this.blocked = null
        try {
          await repo.clearDescriptor()
        } catch {
          // 描述符清不掉也回落星空；下次启动会再走一次失败分支
        }
        this.notice = '背景素材读取失败，已恢复默认星空'
        this.applyBackground()
      }
    },

    /** 顺序固定：MIME/体积 → 解码探针 → 分辨率门 → estimate → OPFS → 描述符 → 换 URL */
    async chooseFile(file) {
      const meta = validateMeta(file)
      if (!meta.ok) throw new Error(meta.message)
      if (!repo.opfsSupported()) throw new Error('当前浏览器无法保存背景素材')
      const dims = meta.kind === 'video' ? await probeVideo(file) : await probeImage(file)
      if (meta.kind !== 'video') {
        const gate = checkCoverResolution(dims.width, dims.height, currentView())
        if (!gate.ok) throw new Error(gate.message)
      }
      await ensureCapacity(file.size)
      try {
        await repo.writeBytes(file)
      } catch {
        throw new Error('无法保存背景素材')
      }
      const descriptor = {
        kind: meta.kind,
        mime: meta.mime,
        size: meta.size,
        updatedAt: new Date().toISOString(),
        width: dims.width,
        height: dims.height,
      }
      try {
        await repo.setDescriptor(descriptor)
      } catch {
        await repo.removeBytes().catch(() => {})
        throw new Error('无法保存背景设置')
      }
      this.revoke()
      this.descriptor = descriptor
      this.kind = descriptor.kind
      this.url = URL.createObjectURL(file)
      this.blocked = null
      this.notice = ''
      this.applyBackground()
      return descriptor
    },

    async remove() {
      this.revoke()
      this.descriptor = null
      this.kind = 'starfield'
      this.blocked = null
      this.notice = ''
      this.applyBackground()
      let failed = false
      try {
        await repo.removeBytes()
      } catch {
        failed = true
      }
      try {
        await repo.clearDescriptor()
      } catch {
        failed = true
      }
      if (failed) this.notice = '背景文件清理失败，已恢复默认星空'
    },

    /** 沉浸未关闭：视频卸载、星点隐藏、--bg-image 暂换星空、极性锁 dark */
    setSuspended(value) {
      const next = !!value
      if (next === this.suspended) return
      this.suspended = next
      if (next) {
        document.documentElement.setAttribute('data-bg-suspended', '')
      } else {
        document.documentElement.removeAttribute('data-bg-suspended')
      }
      this.applyBackground()
    },
  },
})
