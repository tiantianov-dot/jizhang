import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import './styles/base.css'
import './styles/glass.css'

// 首帧属性：CSS/JS 就绪前即为玻璃 + 暗极性 + 程序化星空，避免白闪
const root = document.documentElement
root.dataset.glass = 'on'
root.dataset.polarity = 'dark'
root.dataset.bg = 'starfield'
root.style.setProperty('--bg-image', 'none')

// 首帧防闪：IDB 真值稍后由 appearance store 校正，localStorage 只做镜像
try {
  const rawIntensity = localStorage.getItem('jizhang:uiGlassIntensity')
  const intensity = rawIntensity === null ? NaN : Number(rawIntensity)
  if (Number.isFinite(intensity) && intensity >= 0 && intensity <= 1) {
    root.style.setProperty('--glass-intensity', String(intensity))
  }
  const rawFill = localStorage.getItem('jizhang:uiGlassFill')
  const fill = rawFill === null ? NaN : Number(rawFill)
  if (Number.isFinite(fill) && fill >= 0 && fill <= 0.3) {
    root.style.setProperty('--glass-alpha', String(fill))
  }
} catch {
  // localStorage 不可用时保持默认强度与填充
}

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
