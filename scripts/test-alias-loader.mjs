/**
 * scripts/test-alias-loader.mjs — 仅 Node 测试使用：把 Vite 的 `@/` 别名映射到 `src/`
 *
 * 用法：node --import ./scripts/test-alias-loader.mjs --test
 * - `@/x` → `src/x.js` 或 `src/x/index.js`
 * - 相对导入省略扩展名（Vite 写法）→ 补 `.js` / `/index.js`
 * - 其它 specifier 原样交给 Node
 */
import { statSync } from 'node:fs'
import { registerHooks } from 'node:module'

const srcDir = new URL('../src/', import.meta.url)

function isFile(url) {
  try {
    return statSync(url).isFile()
  } catch {
    return false
  }
}

function resolveWithin(baseURL, specifier) {
  for (const candidate of [specifier, `${specifier}.js`, `${specifier}/index.js`]) {
    const url = new URL(candidate, baseURL)
    if (isFile(url)) return { url: url.href, shortCircuit: true }
  }
  return null
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const resolved = resolveWithin(srcDir, specifier.slice(2))
      if (resolved) return resolved
      throw new Error(`Cannot resolve ${specifier} via @/ alias (scripts/test-alias-loader.mjs)`)
    }
    if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL &&
      !isFile(new URL(specifier, context.parentURL))
    ) {
      const resolved = resolveWithin(context.parentURL, specifier)
      if (resolved) return resolved
    }
    return nextResolve(specifier, context)
  },
})
