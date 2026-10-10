# PduLoom

多协议报文生成与解析工具 · Protocol Frame Builder & Analyzer

当前完成第一阶段：Vue 3 基础界面、五个页面导航、响应式布局、浅色与深色主题。协议计算尚未实现，固定示例明确标记为演示，相关操作禁用。

## 开发与构建

环境：Node.js 20.9 或更高版本及 npm。当前使用 Vue 3、TypeScript、Vite 6、Tailwind CSS 4、Lucide Icons 和 Vitest 3。

```sh
npm install
npm run dev
npm test
npm run build
```

开发地址以终端输出为准，默认 http://127.0.0.1:5173 。构建产物位于 `dist/`，可通过 `npm run preview` 预览。单独类型检查使用 `npm run typecheck`。

## 目录

- `src/core/`：协议核心预留目录。
- `src/components/`：通用卡片组件。
- `src/views/`：报文生成、报文解析、格式转换、校验计算、数据转换页面。
- `src/ui/`：导航和主题配置。
- `src/style.css`：Tailwind 引入、公共样式与响应式规则。
- `tests/`：当前为基础界面配置测试，第二阶段补充协议核心测试。

## 已实现与计划

已实现：左侧分组导航、五页切换、主题切换及偏好保存、双栏工作区域、居中校验卡片、窄屏布局。格式转换提供独立页面；侧边栏可收起为图标窄栏与展开，切换按钮位于侧栏顶部。解析规则支持字段名称、从 0 开始的完整报文字节偏移、数据类型、字节序的编辑以及添加、删除；规则仅在当前会话内保留，计算待协议核心接入。HJ 212 与自定义协议只标记为计划支持。

下一阶段实现 Modbus CRC16 / LRC、PDU 与 RTU / ASCII / TCP 编解码和标准测试向量，然后按开发说明逐步接入页面。第一版计算在浏览器本地完成，页面加载后允许断网使用，不要求离线重新打开。

Windows 桌面版待网页版稳定后使用 Tauri 2 封装，本阶段未安装 Rust 或配置 Tauri，因此暂无桌面构建命令。

开发协作规范见 `AGENTS.md`。
