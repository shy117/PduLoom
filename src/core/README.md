# 协议核心

核心使用独立 TypeScript 实现，不依赖 Vue、界面控件或 Tauri。

## 已实现：Modbus CRC16

模块：`checksum/crc16.ts`。输入支持只读数值数组和 `Uint8Array`；普通数组的每个元素必须为 0～255 的整数，非法输入抛出中文 `RangeError`。函数不修改输入。

- `calculateCrc16(data)`：返回 16 位 CRC 数值；空输入返回初始值 `0xFFFF`。
- `formatCrc16Bytes(crc, order)`：位于 `checksum/crc16-format.ts`，仅格式化 CRC 数值为字节；默认 `low-first`，可选 `high-first`。
- `verifyCrc16(frame, order)`：按指定字节顺序把末尾两个字节作为 CRC，默认 `low-first`，可选 `high-first`；返回 `valid`、`receivedCrc`、`calculatedCrc`，不足两个字节时报错。

示例：`01 03 00 00 00 02` 得到 `0x0BC4`，追加字节为 `C4 0B`。

完整输入的校验仅判断 CRC 是否匹配，不验证 RTU 地址、功能码、业务数据或帧长度规范。只有 `FF FF` 的输入按空数据 CRC 判断匹配，但不代表有效 RTU 报文。

算法采用初始值 `0xFFFF`、反射多项式 `0xA001`，不做最终异或，实际发送低字节在前。规范参考 [Modbus 串行规范 V1.02](https://www.modbus.org/docs/Modbus_over_serial_line_V1_02.pdf)，标准检查向量参考 [CRC RevEng](https://reveng.sourceforge.io/crc-catalogue/16.htm#crc.cat.crc-16-modbus)。

CRC16 已接入校验计算页面，支持计算、完整报文 CRC 校验、输出字节排序以及 CRC 字节和完整报文复制。校验按所选输出字节顺序提取 CRC，字节顺序不匹配时校验失败；切换顺序后已有校验结果自动更新。Modbus RTU 组帧必须固定低字节在前，不提供排序切换。

## 已实现：Modbus LRC

模块：`checksum/lrc.ts`。与 CRC16 共用字节输入校验，接受只读数值数组和 `Uint8Array`，不修改输入。

- `calculateLrc(data)`：累加数据字节，取低 8 位的二进制补码，返回 0～255；空输入返回 `0x00`。
- `verifyLrc(frame)`：读取末尾一个字节作为 LRC，返回 `valid`、`receivedLrc`、`calculatedLrc`；空报文抛出中文 `RangeError`。
- `formatLrcAsciiFrame(frame)`：将包含 LRC 的字节序列转为冒号开头、连续大写 HEX、实际 CRLF 结尾的 ASCII 文本；不添加空格，不重新计算 LRC，不验证业务结构。

计算针对 ASCII 编码前的原始数据字节，不包含帧起始冒号和结束 CRLF，不对 HEX 字符的 ASCII 码求和。校验仅判断 LRC 是否匹配，不验证 ASCII 帧结构；只有 `00` 的输入可以匹配空数据，但不是有效 Modbus ASCII 帧。

标准向量：`02 01 00 00 00 08` → `F5`，来自[三菱 MODBUS 接口模块手册表 4.6、4.7](https://dl.mitsubishielectric.com/dl/fa/document/manual/plc/sh080578eng/sh080578engk.pdf#page=68)。页面默认示例：`01 03 00 00 00 02` → `FA`。

校验计算页面为通用工具，目前提供 CRC16 / Modbus 和 LRC / Modbus ASCII。两种算法均支持计算、校验、复制校验字节和追加或替换校验值后的报文；LRC 为单字节，不显示字节顺序选项。空输入时填入对应算法的示例再执行，切换算法后清除旧结果并保留输入。LRC 校验输入仍使用 HEX 数据字节；完整报文输出及复制包含 ASCII 帧的冒号和实际 CRLF，无空格，可按文本 / ASCII 模式发送。例如默认示例输出 `:010300000002FA` 后跟 CRLF。

Modbus PDU、RTU / TCP 编解码、ASCII 帧解析和数据转换尚未实现。
