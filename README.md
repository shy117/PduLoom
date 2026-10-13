# PduLoom

多协议报文生成与解析工具 · Protocol Frame Builder & Analyzer

PduLoom 用于协议调试中的报文构建、校验和数据转换，提供网页版和 Windows 桌面版。核心计算在本地完成，不依赖在线接口或后台服务器。

项目专注于离线报文处理，不包含实际串口或网络通信。

## 功能

- **Modbus RTU 报文生成**：支持 `01`、`02`、`03`、`04`、`05`、`06`、`0F`、`10` 功能码（十六进制）的请求、正常响应及异常响应，自动计算 CRC16，展示完整 HEX 和字段明细，支持复制结果。
- **Modbus RTU 报文解析**：支持上述功能码的单条完整报文解析、自动识别与手动指定类型、独立 CRC 和协议结构检查、字段与原始字节联动高亮、寄存器与状态展示，以及按完整报文偏移配置的数据类型解析规则。请求和响应无法区分时明确提示；CRC 错误仍可查看安全解析的字段。
- **校验计算**：支持 Modbus CRC16 和 LRC 的计算、完整报文校验及结果复制。
- **数据转换**：支持 16/32/64 位有符号与无符号整数、32/64 位浮点数的十进制与 HEX 双向转换，支持字节序选择和寄存器视图。
- **界面**：支持浅色与深色主题、可收起导航和响应式布局。

格式转换目前仅提供基础界面，尚未接入协议核心。Modbus ASCII / TCP 报文生成与解析、批量报文拆分、请求响应配对、规则保存、HJ 212 和自定义协议为后续计划。

网页版加载后可断网进行计算；独立桌面程序无需开发服务器即可运行。

## 开发环境

网页版需要 Node.js 20.9 或更高版本及 npm。前端使用 Vue 3、TypeScript、Vite、Tailwind CSS 和 Vitest。

Windows 桌面版使用 Tauri 2，还需要：

- Rust 1.90 或更高版本，使用 `x86_64-pc-windows-msvc` 工具链。
- Visual Studio 或 Microsoft C++ Build Tools，包含 MSVC x64 编译工具和 Windows SDK。
- Microsoft Edge WebView2 Runtime。

首次安装依赖和构建需要联网。

## 开发与构建

以下命令均在项目根目录执行。

### 网页版

```sh
# 安装依赖
npm install

# 启动开发服务
npm run dev

# 构建生产版本
npm run build

# 预览构建结果
npm run preview
```

开发地址默认为 `http://127.0.0.1:5173`，构建产物位于 `dist/`。

### Windows 桌面版

```sh
# 启动桌面开发程序，同时启动 Vite 服务
npx tauri dev

# 构建独立程序，不生成安装包
npx tauri build --no-bundle
```

运行 `npx tauri dev` 前，应停止已占用 5173 端口的开发服务。

独立程序输出为 `src-tauri/target/release/PduLoom.exe`，运行时需要 WebView2 Runtime，无需 Node.js、Rust 或 Vite 服务。开发模式程序位于 `src-tauri/target/debug/PduLoom.exe`，仍依赖 Vite 服务。

### 测试与类型检查

```sh
npm test
npm run typecheck
```

## 项目结构

```text
src/
  core/         协议核心、校验算法与数据转换
  components/   公共界面组件
  views/        功能页面
  ui/           导航和主题配置
src-tauri/      Windows 桌面入口与配置
tests/          单元测试
```

协议核心不依赖 Vue 或 Tauri，接口说明见 [src/core/README.md](src/core/README.md)。开发协作规范见 [AGENTS.md](AGENTS.md)。
