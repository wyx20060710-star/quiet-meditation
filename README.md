# 片刻 · 极简冥想计时器

1.0.0 正式发布候选包。应用采用原生 TypeScript、DOM、SVG、CSS 和 IndexedDB，无账号、无业务服务器，所有记录只保存在当前设备。当前版本已完成核心流程、两套主题、完成提示音、恢复、多标签页收敛、离线/PWA，以及响应式、性能和无障碍验收。

## 本地运行

```bash
pnpm install
pnpm dev
```

## 验证

```bash
pnpm release:check
```

生产构建输出在 `dist/`，资源使用相对路径，可部署到域名根目录或子路径。PWA 与离线缓存需要通过 HTTPS 或本机地址访问；增强层不可用时，普通网页计时流程仍可独立运行。

产品与技术约束分别见 `PROJECT_CHARTER.md` 和 `docs/04-technical-architecture.md`。
阶段七测试结论与浏览器支持边界见 `docs/07-test-acceptance.md`。
阶段八发布状态、部署要求和上线复核清单见 `docs/08-release.md`；面向使用者的版本说明见 `RELEASE_NOTES.md`。
