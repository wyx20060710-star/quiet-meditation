# 片刻 · 沉浸式冥想空间

2.1.0 重新整理首页：时长与声音集中在准备卡片，最近记录可从首页直接展开。计时页提供操作入口，声音状态即时同步，键盘焦点所在的操作区保持可用，存储失败提供反馈。

本次自主优化的设计、验证与回滚方式见 [优化记录](docs/09-self-optimization.md)。

2.0.0 版本将“片刻”从极简计时器重塑为一处愿意进入的安静空间。应用根据设备本地时间呈现晨、昼、暮、夜四种抽象林间光影，并使用程序化环境声营造低干扰的冥想氛围。

应用继续采用原生 TypeScript、DOM、SVG、CSS、Web Audio 和 IndexedDB：无账号、无分析脚本、无业务服务器，记录只保存在当前设备。可靠计时、暂停恢复、多标签页收敛、离线/PWA 与无障碍能力保持不变。

生产地址：<https://quiet-meditation.pages.dev>

## 本地运行

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm release:check
```

生产构建输出在 `dist/`，资源使用相对路径，可部署到域名根目录或子路径。PWA 与离线缓存需要 HTTPS 或本机地址；Web Audio 不可用时，计时和记录仍可正常工作。

产品决策见 `PROJECT_CHARTER.md`，数据契约与技术边界见 `docs/04-data-contracts.schema.json` 和 `docs/04-technical-architecture.md`。
