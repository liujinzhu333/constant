/**
 * 生成插件图标（需要 Node.js 环境，无需额外依赖）
 * 用 Canvas API 通过 node-canvas 生成，或直接生成 SVG 后让浏览器渲染
 * 
 * 这里用纯 Node.js 写入一个极简 1×1 像素的合法 PNG（占位）
 * 实际图标在 icon.svg 中定义，Chrome 加载扩展时用 SVG 的话需要转 PNG
 * 
 * 运行: node gen-icons.js
 */

const fs = require('fs')
const path = require('path')

// 最小合法 PNG（1×1 透明像素），Base64 解码
// 实际项目中替换为真实图标的 Buffer
const SIZES = [16, 32, 48, 128]

// 这是一个带星星的简单 SVG，用于说明图标内容
// 实际 PNG 需要用 sharp/canvas 等工具转换，这里生成 SVG 文件供参考
const svgContent = (size) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
  <rect width="128" height="128" rx="24" fill="#6366f1"/>
  <text x="64" y="88" font-size="80" text-anchor="middle" fill="white" font-family="Arial">★</text>
</svg>`

// 生成 SVG 文件（Chrome MV3 的 action icon 支持 PNG，不支持 SVG）
// 所以这里生成 SVG 并提示用户转换
for (const size of SIZES) {
  fs.writeFileSync(path.join(__dirname, 'icons', `icon${size}.svg`), svgContent(size))
  console.log(`生成 icons/icon${size}.svg`)
}

console.log('\n图标 SVG 已生成。')
console.log('Chrome 插件需要 PNG 格式，请将 SVG 转换为对应尺寸的 PNG。')
console.log('可用工具：')
console.log('  - Inkscape: inkscape icon128.svg -o icon128.png -w 128 -h 128')
console.log('  - rsvg-convert: rsvg-convert -w 128 -h 128 icon128.svg > icon128.png')
console.log('  - 或直接在 Chrome 扩展调试时先用 SVG 占位')
