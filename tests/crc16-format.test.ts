import { describe, expect, it } from 'vitest';
import { formatCrc16Bytes } from '../src/core/checksum/crc16-format';

describe('CRC16 输出字节排序', () => {
  it('默认低字节在前，允许高字节在前', () => {
    expect(formatCrc16Bytes(0x0bc4)).toEqual([0xc4, 0x0b]);
    expect(formatCrc16Bytes(0x0bc4, 'high-first')).toEqual([0x0b, 0xc4]);
  });
  it('保持前导零字节与数值边界', () => {
    expect(formatCrc16Bytes(0)).toEqual([0, 0]);
    expect(formatCrc16Bytes(0xff, 'high-first')).toEqual([0, 0xff]);
    expect(formatCrc16Bytes(0xffff)).toEqual([0xff, 0xff]);
  });
  it.each([-1, 65536, 1.5, NaN, Infinity])('拒绝非法 CRC 数值 %s', crc => {
    expect(() => formatCrc16Bytes(crc)).toThrow(RangeError);
  });
});
