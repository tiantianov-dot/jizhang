/**
 * composables/immersiveMock.js — 仅 DEV 下经 ?mockcamera 动态载入的相机替身
 *
 * 离屏 canvas 画动态渐变，captureStream(10) 产出真 MediaStream，
 * 让无摄像头的桌面也能走通 live / idle / ended 全分支。
 */
export function createMockStream() {
  const canvas = document.createElement('canvas')
  canvas.width = 640
  canvas.height = 480
  const ctx = canvas.getContext('2d')

  let frame = 0
  let raf = 0

  function draw() {
    const hue = (frame * 2) % 360
    frame += 1
    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height)
    grad.addColorStop(0, `hsl(${hue}, 55%, 38%)`)
    grad.addColorStop(1, `hsl(${(hue + 90) % 360}, 50%, 16%)`)
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    raf = requestAnimationFrame(draw)
  }

  draw()
  const stream = canvas.captureStream(10)
  for (const track of stream.getTracks()) {
    track.onended = () => cancelAnimationFrame(raf)
  }
  return stream
}
