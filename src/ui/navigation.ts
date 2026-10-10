export const pages = [
  { id: 'builder', title: '报文生成', description: '配置参数，构建完整的 Modbus 报文。' },
  { id: 'parser', title: '报文解析', description: '配置解析规则，查看报文字段与校验状态。' },
  { id: 'format', title: '格式转换', description: '在 Modbus RTU、ASCII 和 TCP 报文格式之间转换。' },
  { id: 'checksum', title: '校验计算', description: '独立计算与验证 Modbus CRC16 / LRC。' },
  { id: 'converter', title: '数据转换', description: '在数值、原始字节与寄存器数据之间转换。' },
] as const;
export type PageId = typeof pages[number]['id'];
