# PduLoom

多协议报文生成与解析工具 · Protocol Frame Builder & Analyzer

当前完成第一阶段：Vue 3 基础界面、五个页面导航、响应式布局、浅色与深色主题。已开始第二阶段，独立 Modbus CRC16、LRC 和数据转换核心已实现，并接入校验计算和数据转换页面；界面固定示例明确标记为演示，其余未实现的协议操作禁用。

## 开发与构建

环境：Node.js 20.9 或更高版本及 npm。当前使用 Vue 3、TypeScript、Vite 6、Tailwind CSS 4、Lucide Icons 和 Vitest 3。

```sh
npm install
npm run dev
npm test
npm run build
```

开发地址以终端输出为准，默认 http://127.0.0.1:5173 。构建产物位于 `dist/`，可通过 `npm run preview` 预览。单独类型检查使用 `npm run typecheck`。

### Windows 桌面版

桌面版使用 Tauri 2，与网页版共用 Vue 界面和协议核心。编译环境需要：

- 上述 Node.js 和 npm 环境。
- Rust 1.90 或更高版本，使用 `x86_64-pc-windows-msvc` 工具链。
- Visual Studio 或 Microsoft C++ Build Tools，包含 MSVC x64 编译工具和 Windows SDK。
- Microsoft Edge WebView2 Runtime。

可复用已有的 MSVC 开发环境，无需重复安装。使用 `rustc --version`、`cargo --version` 和 `rustup show` 检查 Rust 环境；首次构建需要联网下载依赖。

在项目根目录执行桌面开发命令：

```sh
npx tauri dev
```

该命令自动执行 `npm run dev`，启动 Vite 并打开桌面窗口。开发地址固定为 `http://127.0.0.1:5173`，运行前应停止占用该端口的开发服务。`src-tauri/target/debug/app.exe` 为开发模式程序，仍依赖 Vite 服务。

构建可独立运行的 Windows 程序，不生成安装包：

```sh
npx tauri build --no-bundle
```

该命令自动执行 `npm run build` 并将前端资源嵌入程序，输出为 `src-tauri/target/release/app.exe`。运行时需要 WebView2 Runtime，无需 Node.js、Rust 或 Vite 服务。停止开发服务后再启动该 EXE，可检查独立运行和断网计算。

当前已完成独立程序构建和启动验证；桌面端计算、校验、复制、主题切换及窗口缩放仍需按实际操作验收，启动成功不代表所有功能已验证。

## 目录

- `src/core/`：独立协议核心，已实现 Modbus CRC16、LRC 计算与校验，以及数值与字节转换。
- `src/components/`：通用卡片组件。
- `src/views/`：报文生成、报文解析、格式转换、校验计算、数据转换页面。
- `src/ui/`：导航和主题配置。
- `src/style.css`：Tailwind 引入、公共样式与响应式规则。
- `tests/`：基础界面配置、HEX 输入、CRC16 / LRC 及数据转换核心测试。
- `src-tauri/`：桌面入口、Rust 依赖、Tauri 配置、权限和图标资源。

## 已实现与计划

已实现：左侧分组导航、五页切换、主题切换及偏好保存、双栏工作区域、居中校验卡片、窄屏布局。格式转换提供独立页面；侧边栏可收起为图标窄栏与展开，切换按钮位于侧栏顶部。解析规则支持字段名称、从 0 开始的完整报文字节偏移、数据类型、字节序的编辑以及添加、删除；规则仅在当前会话内保留，计算待协议核心接入。HJ 212 与自定义协议只标记为计划支持。

通用校验计算页面目前支持 Modbus CRC16 和 LRC 的计算、完整报文校验及结果复制，接口见 `src/core/README.md`。CRC16 按所选字节顺序校验，顺序不匹配时失败；LRC 按末尾一个字节校验，无字节顺序选项。两种算法均支持空输入自动填入示例。LRC 输入使用 HEX 数据字节，不包含帧包装；完整报文输出为冒号开头、连续大写 HEX、实际 CRLF 结尾的 Modbus ASCII 文本，复制后可按文本 / ASCII 模式发送。后续可增加校验算法，并实现 PDU、RTU / TCP 编解码及 ASCII 帧解析和对应标准测试向量。第一版计算在浏览器本地完成，页面加载后允许断网使用，不要求离线重新打开。

数据转换页面支持 UINT16、INT16、UINT32、INT32、UINT64、INT64、FLOAT32 和 FLOAT64 的十进制数值与 HEX 字节双向转换，按类型提供字节序选项，显示实际数值、HEX 字节与每两个字节拆分的寄存器值，并支持复制数值及 HEX 字节。64 位整数使用 BigInt 保持精度；浮点数按 IEEE 754 舍入，支持 NaN、Infinity 和负零，有限数值溢出或下溢为零时报错。不提供系数和偏移量。空输入时自动填入当前配置的示例再转换；输入、类型、方向或字节序变化后清除旧结果。核心测试和前端构建已通过，界面交互、复制、主题与响应式效果由用户验收。

Windows 桌面版已接入 Tauri 2，开发和独立程序构建方法见上文。安装包制作与分发验证后续按需求开展。

开发协作规范见 `AGENTS.md`。
