import { describe, expect, it } from 'vitest';
import { encodeDataValue, decodeDataValue, getByteOrders, getByteLength, bytesToRegisters, formatDataValue, type DataType, type ByteOrder } from '../src/core/data-conversion';
import { parseHexBytes } from '../src/core/hex';

const bytes = (text: string) => parseHexBytes(text);

describe('数值与字节转换', () => {
  // IEEE 754 标准向量来自 Oracle Numerical Computation Guide 表 3、表 5：
  // https://docs.oracle.com/cd/E60778_01/html/E60763/z4000ac019878.html
  // 整数向量按无符号位置权值、二进制补码手工确定，不以自身往返作为依据。
  const vectors: [DataType, string, string, number | bigint][] = [
    ['UINT16', '4660', '12 34', 4660],
    ['UINT16', '65535', 'FF FF', 65535],
    ['INT16', '-32768', '80 00', -32768],
    ['INT16', '32767', '7F FF', 32767],
    ['INT16', '-1', 'FF FF', -1],
    ['UINT32', '305419896', '12 34 56 78', 305419896],
    ['UINT32', '4294967295', 'FF FF FF FF', 4294967295],
    ['INT32', '-2147483648', '80 00 00 00', -2147483648],
    ['INT32', '2147483647', '7F FF FF FF', 2147483647],
    ['UINT64', '9007199254740993', '00 20 00 00 00 00 00 01', 9007199254740993n],
    ['UINT64', '18446744073709551615', 'FF FF FF FF FF FF FF FF', 18446744073709551615n],
    ['INT64', '-9223372036854775808', '80 00 00 00 00 00 00 00', -9223372036854775808n],
    ['INT64', '9223372036854775807', '7F FF FF FF FF FF FF FF', 9223372036854775807n],
    ['INT64', '-1', 'FF FF FF FF FF FF FF FF', -1n],
    ['FLOAT32', '1', '3F 80 00 00', 1],
    ['FLOAT32', '2', '40 00 00 00', 2],
    ['FLOAT32', '-0', '80 00 00 00', -0],
    ['FLOAT32', '1.40129846e-45', '00 00 00 01', 2 ** -149],
    ['FLOAT64', '1', '3F F0 00 00 00 00 00 00', 1],
    ['FLOAT64', '-0', '80 00 00 00 00 00 00 00', -0],
    ['FLOAT64', '4.9406564584124654e-324', '00 00 00 00 00 00 00 01', Number.MIN_VALUE],
  ];
  it.each(vectors)('%s 编码 %s 为标准向量 %s，并独立解码', (type, input, expected, value) => {
    expect(encodeDataValue(input, type)).toEqual(bytes(expected));
    expect(decodeDataValue(bytes(expected), type)).toBe(value);
  });

  const orderVectors: [DataType, string, ByteOrder, string][] = [
    ['UINT16', '4660', 'AB', '12 34'], ['UINT16', '4660', 'BA', '34 12'],
    ['UINT32', '305419896', 'ABCD', '12 34 56 78'],
    ['UINT32', '305419896', 'BADC', '34 12 78 56'],
    ['UINT32', '305419896', 'CDAB', '56 78 12 34'],
    ['UINT32', '305419896', 'DCBA', '78 56 34 12'],
    ['UINT64', '72623859790382856', 'ABCDEFGH', '01 02 03 04 05 06 07 08'],
    ['UINT64', '72623859790382856', 'BADCFEHG', '02 01 04 03 06 05 08 07'],
    ['UINT64', '72623859790382856', 'GHEFCDAB', '07 08 05 06 03 04 01 02'],
    ['UINT64', '72623859790382856', 'HGFEDCBA', '08 07 06 05 04 03 02 01'],
  ];
  it.each(orderVectors)('%s 的 %s 按 %s 排列为 %s', (type, input, order, expected) => {
    expect(encodeDataValue(input, type, order)).toEqual(bytes(expected));
    expect(decodeDataValue(bytes(expected), type, order)).toBe(type === 'UINT64' ? BigInt(input) : Number(input));
  });

  it('FLOAT32 保留完整四字节，按两个寄存器拆分', () => {
    expect(bytesToRegisters(bytes('3F 80 00 00'))).toEqual([16256, 0]);
    expect(bytesToRegisters(bytes('00 00 3F 80'))).toEqual([0, 16256]);
    expect(getByteLength('FLOAT32')).toBe(4);
    expect(getByteLength('FLOAT64')).toBe(8);
    expect(getByteOrders('UINT16')).toEqual(['AB', 'BA']);
  });

  it('FLOAT32 按实际精度舍入，支持科学计数法', () => {
    expect(encodeDataValue('0.1', 'FLOAT32')).toEqual(bytes('3D CC CC CD'));
    expect(decodeDataValue(bytes('3D CC CC CD'), 'FLOAT32')).toBe(0.10000000149011612);
    expect(encodeDataValue('1e0', 'FLOAT32')).toEqual(bytes('3F 80 00 00'));
  });

  it('支持特殊值与负零，NaN 解码保留输入字节', () => {
    expect(decodeDataValue(bytes('7F C0 00 01'), 'FLOAT32')).toBeNaN();
    expect(decodeDataValue(bytes('7F F8 00 00 00 00 00 00'), 'FLOAT64')).toBeNaN();
    expect(encodeDataValue('Infinity', 'FLOAT32')).toEqual(bytes('7F 80 00 00'));
    expect(encodeDataValue('-Infinity', 'FLOAT64')).toEqual(bytes('FF F0 00 00 00 00 00 00'));
    expect(decodeDataValue(encodeDataValue('NaN', 'FLOAT32'), 'FLOAT32')).toBeNaN();
    expect(formatDataValue(-0)).toBe('-0');
    expect(formatDataValue(18446744073709551615n)).toBe('18446744073709551615');
  });

  it.each([
    ['UINT16', '-1'], ['UINT16', '65536'], ['INT16', '-32769'], ['INT16', '32768'],
    ['UINT32', '4294967296'], ['INT32', '-2147483649'], ['INT32', '2147483648'],
    ['UINT64', '18446744073709551616'], ['UINT64', '-1'],
    ['INT64', '-9223372036854775809'], ['INT64', '9223372036854775808'],
  ] as [DataType, string][])('%s 拒绝越界整数 %s', (type, value) => {
    expect(() => encodeDataValue(value, type)).toThrow(/范围/);
  });

  it.each(['', ' ', '1.5', '1e2', '0x10', 'NaN', 'Infinity', '12abc', '1 2'])('拒绝非法整数 %s', input => {
    expect(() => encodeDataValue(input, 'UINT16')).toThrow();
  });
  it.each(['', '0x10', '12abc', '1 2', '1e', '--1'])('拒绝非法浮点数 %s', input => {
    expect(() => encodeDataValue(input, 'FLOAT32')).toThrow();
  });
  it('报告有限浮点数溢出和归零下溢', () => {
    expect(() => encodeDataValue('3.5e38', 'FLOAT32')).toThrow(/范围/);
    expect(() => encodeDataValue('1e309', 'FLOAT64')).toThrow(/范围/);
    expect(() => encodeDataValue('1e-50', 'FLOAT32')).toThrow(/下溢/);
    expect(() => encodeDataValue('1e-999', 'FLOAT64')).toThrow(/下溢/);
    expect(encodeDataValue('0e-999', 'FLOAT64')).toEqual(bytes('00 00 00 00 00 00 00 00'));
  });
  it('拒绝长度错误、非法字节和不匹配的字节序', () => {
    expect(() => decodeDataValue([0, 1], 'FLOAT32')).toThrow(/恰好 4/);
    expect(() => decodeDataValue([0, 1, 2, 3, 4], 'FLOAT32')).toThrow(/恰好 4/);
    expect(() => decodeDataValue([], 'UINT16')).toThrow();
    for (const invalid of [-1, 256, 1.5, NaN]) {
      expect(() => decodeDataValue([0, invalid], 'UINT16')).toThrow();
    }
    expect(() => encodeDataValue('1', 'UINT16', 'ABCD')).toThrow(/字节序/);
    expect(() => decodeDataValue([0, 1], 'UINT16', 'ABCD')).toThrow(/字节序/);
    expect(() => bytesToRegisters([0])).toThrow();
    expect(() => bytesToRegisters([])).toThrow();
  });
  it('接受只读数组与 Uint8Array，不修改输入', () => {
    const array = Object.freeze([0x12, 0x34]);
    const typed = new Uint8Array([0x34, 0x12]);
    expect(decodeDataValue(array, 'UINT16')).toBe(4660);
    expect(decodeDataValue(typed, 'UINT16', 'BA')).toBe(4660);
    expect(bytesToRegisters(array)).toEqual([4660]);
    expect([...typed]).toEqual([0x34, 0x12]);
  });
});
