import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import bgStarfield from './assets/bg-starfield.webp'
import './styles/base.css'
import './styles/glass.css'

// 玻璃主题与背景图在挂载前就位：背景层可被 V4-2 的上传素材覆盖同一变量
document.documentElement.dataset.glass = 'on'
document.documentElement.style.setProperty('--bg-image', `url("${bgStarfield}")`)

// 首帧防闪：IDB 真值稍后由 appearance store 校正，localStorage 只做镜像
try {
  const stored = Number(localStorage.getItem('jizhang:uiGlassIntensity'))
  if (Number.isFinite(stored) && stored >= 0.3 && stored <= 1) {
    document.documentElement.style.setProperty('--glass-intensity', String(stored))
  }
} catch {
  // localStorage 不可用时保持默认强度
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
