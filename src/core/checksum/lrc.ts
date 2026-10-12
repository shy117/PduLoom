import { assertBytes, type ByteInput } from './bytes';

export interface LrcVerification {
  valid: boolean;
  receivedLrc: number;
  calculatedLrc: number;
}

/** 对原始数据字节求和后取低 8 位的二进制补码，不包括 ASCII 帧的冒号和 CRLF。 */
export function calculateLrc(data: ByteInput): number {
  assertBytes(data);
  let sum = 0;
  for (const byte of data) {
    sum = (sum + byte) & 0xff;
  }
  return (-sum) & 0xff;
}

/** 仅校验末尾一个 LRC 字节，不检查 Modbus ASCII 帧结构。 */
export function verifyLrc(frame: ByteInput): LrcVerification {
  assertBytes(frame);
  if (frame.length < 1) {
    throw new RangeError('完整报文至少需要包含一个 LRC 字节');
  }
  const receivedLrc = frame[frame.length - 1]!;
  const calculatedLrc = calculateLrc(frame.slice(0, -1));
  return { valid: receivedLrc === calculatedLrc, receivedLrc, calculatedLrc };
}

/** 将含末尾 LRC 的字节序列格式化为 ASCII 帧；只添加帧包装，不重新计算校验值。 */
export function formatLrcAsciiFrame(frame: ByteInput): string {
  assertBytes(frame);
  if (frame.length < 1) {
    throw new RangeError('ASCII 报文至少需要包含一个 LRC 字节');
  }
  const text = Array.from(frame, byte => byte.toString(16).toUpperCase().padStart(2, '0')).join('');
  return `:${text}\r\n`;
}
