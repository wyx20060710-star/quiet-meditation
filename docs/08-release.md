# 极简冥想计时器：阶段八发布复核

> 版本：1.0.0  
> 日期：2026-08-04  
> 当前结论：正式发布候选包已冻结；Cloudflare Pages 项目已建立，首次生产部署待触发

## 1. 阶段范围

本阶段只做静态部署准备、正式版本冻结和发布复核，不增加新页面、账号、云同步、长期分析或游戏化功能。阶段七候选版本保持原生 TypeScript、DOM、SVG、CSS 和 IndexedDB 架构。

## 2. 正式版本冻结

正式发布候选版本号为 `1.0.0`，生产输出目录为 `dist/`。本轮发布修正包括：

- Vite 生产资源改为相对路径，允许部署在域名根目录或任意子路径；
- Manifest 补齐 192×192、512×512 PNG 图标和独立 maskable 图标；
- Service Worker 静态缓存版本由 `v1` 升为 `v2`，并纳入新增图标；
- 新增确定性图标生成脚本和发布就绪回归测试；
- 新增 `pnpm release:check`，统一执行图标生成、全部测试、类型检查和生产构建。

这些改动只影响发布与安装能力，不改变计时、记录、统计、主题或声音规则。

## 3. 本地发布复核结果

| 项目 | 结果 |
|---|---|
| 正式版本号 | `1.0.0` |
| Vitest | 10 个文件、46 项测试全部通过 |
| TypeScript 严格检查 | 通过 |
| Vite 生产构建 | 通过 |
| JavaScript | 39.13 kB，gzip 10.97 kB |
| CSS | 10.03 kB，gzip 3.11 kB |
| HTML | 0.84 kB，gzip 0.53 kB |
| 生产资源路径 | 相对路径，根目录与子路径部署兼容 |
| Manifest 图标 | 192、512、maskable 512 均进入 `dist/` |
| 本机 HTTP 资源 | 首页、Manifest、Service Worker 和图标返回 200 |

阶段八尝试用内置浏览器访问本机生产预览，但该浏览器运行环境无法连接宿主机本地端口，因此没有把这次尝试记为通过或失败。阶段七已经完成 Windows Chromium 的实际核心流程验收；部署后的公开 HTTPS URL 仍须再次执行本文件第 6 节冒烟流程。

## 4. 静态部署要求

部署平台必须满足：

- 直接托管 `dist/` 内的文件，不把其父目录作为网站根；
- 使用 HTTPS；
- 保留文件名、目录层级和 MIME 类型；
- `sw.js` 与 `index.html` 不使用长期强缓存，确保版本更新可被发现；
- `assets/` 下带内容哈希的 JS、CSS 可使用长期不可变缓存；
- 不注入分析、广告、账号或远程数据脚本；
- 若部署到子路径，最终地址必须以该子路径为应用作用域，不能把 Service Worker 提升到站点根作用域。

推荐缓存策略：

| 路径 | 建议 `Cache-Control` |
|---|---|
| `/index.html`、`/sw.js` | `no-cache` |
| `/manifest.webmanifest` | `no-cache` 或短缓存 |
| `/assets/*` | `public, max-age=31536000, immutable` |
| `/icons/*` | `public, max-age=86400` |

## 5. 构建与部署步骤

```bash
pnpm install --frozen-lockfile
pnpm release:check
```

源码已推送到私有 GitHub 仓库 `wyx20060710-star/quiet-meditation`，并连接到 Cloudflare Pages 免费托管。生产分支为 `main`，Cloudflare 构建命令为 `pnpm release:check`，输出目录为 `dist`，预留公开地址为 <https://quiet-meditation.pages.dev>。

Cloudflare GitHub App 仅获准访问 `quiet-meditation` 这一个仓库；未启用付费套餐、自定义域名、分析、数据库或其他付费服务。推送到 `main` 会自动触发生产部署。

发布前保存上一版完整静态产物。若新版本出现阻断问题，回滚上一版文件并确保 `sw.js` 可重新验证；不要只回滚 HTML 而保留不匹配的 Service Worker。

## 6. 部署后 URL 冒烟清单

在最终公开 HTTPS 地址逐项执行：

- [ ] 首页、JS、CSS、Manifest、Service Worker 和三个 PNG 图标均返回 200；
- [ ] 页面无控制台错误或警告；
- [ ] 默认 20 分钟、快捷时间和滑块联动正确；
- [ ] 执行一次 1 分钟流程：开始 → 暂停 → 继续 → 后台恢复 → 自然完成；
- [ ] 刷新后今日记录只增加一次，完成音没有重复播放；
- [ ] 关闭网络后重新打开已缓存页面，核心界面和本地记录仍可使用；
- [ ] 支持安装的浏览器识别到名称、图标、作用域和独立显示模式；
- [ ] 320 px 与桌面视口均无横向溢出；
- [ ] 主题切换、声音关闭与本地记忆正确；
- [ ] 若对外承诺 Firefox、Safari、iOS 或 Android 支持，在对应真实设备补做同一流程。

## 7. 发布门槛状态

- [x] 阶段七无阻断、高或中严重度未关闭缺陷；
- [x] 正式版本号、发布说明和隐私边界已冻结；
- [x] 发布包支持根目录与子路径静态托管；
- [x] PWA 必需尺寸图标与离线缓存版本已补齐；
- [x] 自动化、类型检查、生产构建和本机 HTTP 资源检查通过；
- [x] 已选择 Cloudflare Pages 免费静态托管并获得固定 HTTPS 地址 `https://quiet-meditation.pages.dev`；
- [ ] 已在最终 URL 完成部署后冒烟；
- [ ] 已记录发布日期与最终 URL。

GitHub 与 Cloudflare Pages 已连接。首次生产部署及最终 URL 冒烟通过后，才可把阶段八标记为完全通过并进入阶段九。
