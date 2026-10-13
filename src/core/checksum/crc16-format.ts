export type CrcByteOrder = 'low-first' | 'high-first';

/** 将已计算的 16 位 CRC 数值转换为输出字节，不执行 CRC 计算。 */
export function formatCrc16Bytes(crc: number, order: CrcByteOrder = 'low-first'): [number, number] {
  if (!Number.isInteger(crc) || crc < 0 || crc > 0xffff) {
    throw new RangeError('CRC16 数值必须是 0～65535 的整数');
  }
  const low = crc & 0xff;
  const high = (crc >>> 8) & 0xff;
  return order === 'low-first' ? [low, high] : [high, low];
}
