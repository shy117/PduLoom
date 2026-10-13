# PduLoom v0.1.0 发布说明

## 版本信息

| 项目 | 内容 |
|---|---|
| 软件名称 | PduLoom |
| 版本 | 0.1.0 |
| 作者 / 发布者 | ShyHiker |
| 项目许可证 | Apache-2.0，完整条款见 [LICENSE](LICENSE) |
| 版权声明 | Copyright 2026 ShyHiker |
| 桌面平台 | Windows x64 |

## 功能概览

- Modbus RTU、ASCII、TCP 的离线报文生成、解析及格式转换。
- 支持八种功能码的请求、正常响应及异常响应：`01`、`02`、`03`、`04`、`05`、`06`、`0F`、`10`（十六进制）。
- CRC16、LRC 计算和校验；TCP MBAP 头生成及协议标识、长度检查。
- 数值与 HEX 转换、自定义解析规则、字段联动高亮和寄存器 / 状态视图。
- 浅色 / 深色主题、统一表格、结果复制及响应式布局。

完整功能及操作说明见 [README.md](README.md)，版本变更见 [CHANGELOG.md](CHANGELOG.md)。

## 下载与安装

| 文件 | 用途 | WebView2 |
|---|---|---|
| `PduLoom-v0.1.0-win64-setup.exe` | 联网小体积安装包 | 缺少运行时时联网安装 |
| `PduLoom-v0.1.0-win64-offline-setup.exe` | 离线安装包 | 内嵌 WebView2 离线安装程序 |
| `PduLoom-v0.1.0-win64-portable.zip` | 便携包 | 目标电脑需已有 WebView2 |

程序运行时无需 Node.js、Rust 或开发服务器。已加载的网页版及桌面程序均在本地计算；联网安装包补装 WebView2 的过程需要网络。

安装包按当前用户安装。便携包解压后运行 `PduLoom.exe`，并保留同目录的文档与许可证文件。

安装过程显示中文许可说明，完整 Apache License 2.0 原文见随软件附带的 `LICENSE`；中文说明不替代英文原文。安装器、卸载器和程序使用 PduLoom 图标。

可通过发布目录中的 `SHA256SUMS.txt` 核对下载文件。构建信息见 `release-manifest.json`，第三方依赖声明见 `third-party-inventory.json` 和 `licenses/`。

## 使用注意事项

- 只处理单条完整离线报文；不提供串口连接、TCP 连接或报文发送。
- 源校验失败、结构错误或不支持的功能码不能进行格式转换。
- 请求与正常响应结构相同时无法仅凭报文确定方向；界面保留提示，不强行区分。
- ASCII 复制包含实际 CRLF；输入框末尾单个 LF 按 CRLF 处理，缺少结束符仍需修正。
- TCP 转串行格式会移除事务标识，目标地址必须符合串行地址规则；转换保留业务字节，不推断设备地址映射。
- 尚未实现批量拆帧、TCP 流重组、请求响应配对、规则保存、HJ 212、自定义协议及其他 Modbus 功能码。

## 授权

PduLoom 项目代码使用 Apache License, Version 2.0。第三方依赖保持各自的许可证与版权声明，项目许可证不改变它们的授权条件。官方条款来源：[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)。
