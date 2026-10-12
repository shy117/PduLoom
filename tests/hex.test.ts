import { describe, expect, it } from 'vitest';
import { parseHexBytes } from '../src/core/hex';
import { calculateCrc16, verifyCrc16 } from '../src/core/checksum/crc16';

describe('校验页面 HEX 输入处理', () => {
  it.each(['010300000002', '01 03 00 00 00 02', ' 01\t03\n00 00 00 02 '])('支持输入格式 %s', input => {
    expect(calculateCrc16(parseHexBytes(input))).toBe(0x0bc4);
  });
  it('支持小写并解析完整报文', () => {
    expect(verifyCrc16(parseHexBytes('010300000002c40b')).valid).toBe(true);
  });
  it.each(['', ' \n ', '0x01', 'GG', '01,03', '010', '0 1'])('拒绝空输入或不完整、非法 HEX：%s', input => {
    expect(() => parseHexBytes(input)).toThrow();
  });
});
