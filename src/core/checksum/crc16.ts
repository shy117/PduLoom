import type { CrcByteOrder } from './crc16-format';
import { assertBytes, type ByteInput } from './bytes';

export type { ByteInput } from './bytes';

export interface Crc16Verification {
  valid: boolean;
  receivedCrc: number;
  calculatedCrc: number;
}

/** 计算 Modbus CRC16 数值；空输入返回初始值 0xFFFF。 */
export function calculateCrc16(data: ByteInput): number {
  assertBytes(data);
  let crc = 0xffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

/** 仅校验尾部 CRC，不检查功能码、地址或 RTU 业务结构。 */
export function verifyCrc16(frame: ByteInput, order: CrcByteOrder = 'low-first'): Crc16Verification {
  assertBytes(frame);
  if (frame.length < 2) {
    throw new RangeError('完整报文至少需要包含两个 CRC16 字节');
  }
  const first = frame[frame.length - 2]!;
  const second = frame[frame.length - 1]!;
  const receivedCrc = order === 'low-first' ? first | (second << 8) : (first << 8) | second;
  const calculatedCrc = calculateCrc16(frame.slice(0, -2));
  return { valid: receivedCrc === calculatedCrc, receivedCrc, calculatedCrc };
}
