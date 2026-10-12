import { assertBytes, type ByteInput } from './checksum/bytes';

export const dataTypes = ['UINT16', 'INT16', 'UINT32', 'INT32', 'UINT64', 'INT64', 'FLOAT32', 'FLOAT64'] as const;
export type DataType = typeof dataTypes[number];
export type ByteOrder = 'AB' | 'BA' | 'ABCD' | 'BADC' | 'CDAB' | 'DCBA'
  | 'ABCDEFGH' | 'BADCFEHG' | 'GHEFCDAB' | 'HGFEDCBA';
export type DataValue = number | bigint;

const orders16: readonly ByteOrder[] = ['AB', 'BA'];
const orders32: readonly ByteOrder[] = ['ABCD', 'BADC', 'CDAB', 'DCBA'];
const orders64: readonly ByteOrder[] = ['ABCDEFGH', 'BADCFEHG', 'GHEFCDAB', 'HGFEDCBA'];

export function getByteLength(type: DataType): number {
  if (!dataTypes.includes(type)) {
    throw new RangeError('不支持的数据类型');
  }
  return Number(type.match(/\d+$/)![0]) / 8;
}

export function getByteOrders(type: DataType): readonly ByteOrder[] {
  const length = getByteLength(type);
  return length === 2 ? orders16 : length === 4 ? orders32 : orders64;
}

function checkOrder(type: DataType, order: ByteOrder): void {
  if (!getByteOrders(type).includes(order)) {
    throw new RangeError(`${type} 不支持字节序 ${order}`);
  }
}

function parseInteger(input: string, type: DataType): bigint {
  if (!/^[+-]?\d+$/.test(input)) {
    throw new Error('请输入十进制整数，不支持小数、科学计数法或进制前缀');
  }
  const value = BigInt(input);
  const bits = BigInt(getByteLength(type) * 8);
  const signed = type.startsWith('INT');
  const min = signed ? -(1n << (bits - 1n)) : 0n;
  const max = (1n << (signed ? bits - 1n : bits)) - 1n;
  if (value < min || value > max) {
    throw new RangeError(`${type} 的范围为 ${min}～${max}`);
  }
  return value;
}

function parseFloatValue(input: string): number {
  if (/^[+-]?Infinity$/.test(input) || input === 'NaN') {
    return Number(input);
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(input)) {
    throw new Error('请输入十进制浮点数，可使用科学计数法、NaN 或 Infinity');
  }
  const value = Number(input);
  if (!Number.isFinite(value)) {
    throw new RangeError('浮点数超出 FLOAT64 的有限数值范围');
  }
  // 非零十进制数若在转换时归零，应报告下溢，不能默默生成零。
  if (value === 0 && /[1-9]/.test(input.split(/[eE]/)[0])) {
    throw new RangeError('浮点数过小，转换为 FLOAT64 时会下溢为零');
  }
  return value;
}

/** 十进制数值按指定类型编码；字母从标准大端字节的 A 开始编号。 */
export function encodeDataValue(input: string, type: DataType, order: ByteOrder = getByteOrders(type)[0]): number[] {
  checkOrder(type, order);
  const text = input.trim();
  if (!text) {
    throw new Error('请输入数值');
  }
  const length = getByteLength(type);
  const buffer = new ArrayBuffer(length);
  const view = new DataView(buffer);
  if (type.startsWith('FLOAT')) {
    const value = parseFloatValue(text);
    if (type === 'FLOAT32') {
      const rounded = Math.fround(value);
      if (Number.isFinite(value) && !Number.isFinite(rounded)) {
        throw new RangeError('浮点数超出 FLOAT32 的有限数值范围');
      }
      if (value !== 0 && rounded === 0) {
        throw new RangeError('浮点数过小，转换为 FLOAT32 时会下溢为零');
      }
      view.setFloat32(0, value, false);
    } else {
      view.setFloat64(0, value, false);
    }
  } else {
    const value = parseInteger(text, type);
    switch (type) {
      case 'UINT16': view.setUint16(0, Number(value), false); break;
      case 'INT16': view.setInt16(0, Number(value), false); break;
      case 'UINT32': view.setUint32(0, Number(value), false); break;
      case 'INT32': view.setInt32(0, Number(value), false); break;
      case 'UINT64': view.setBigUint64(0, value, false); break;
      case 'INT64': view.setBigInt64(0, value, false); break;
    }
  }
  const bytes = new Uint8Array(buffer);
  return [...order].map(letter => bytes[letter.charCodeAt(0) - 65]);
}

/** 按字节序还原标准大端字节后解码；64 位整数返回 bigint。 */
export function decodeDataValue(data: ByteInput, type: DataType, order: ByteOrder = getByteOrders(type)[0]): DataValue {
  checkOrder(type, order);
  assertBytes(data);
  const length = getByteLength(type);
  if (data.length !== length) {
    throw new RangeError(`${type} 需要恰好 ${length} 个字节，当前为 ${data.length} 个`);
  }
  const buffer = new ArrayBuffer(length);
  const bytes = new Uint8Array(buffer);
  // 使用逆排列，而非假定任意字节序交换都能通过再交换一次还原。
  [...order].forEach((letter, index) => { bytes[letter.charCodeAt(0) - 65] = data[index]; });
  const view = new DataView(buffer);
  switch (type) {
    case 'UINT16': return view.getUint16(0, false);
    case 'INT16': return view.getInt16(0, false);
    case 'UINT32': return view.getUint32(0, false);
    case 'INT32': return view.getInt32(0, false);
    case 'UINT64': return view.getBigUint64(0, false);
    case 'INT64': return view.getBigInt64(0, false);
    case 'FLOAT32': return view.getFloat32(0, false);
    case 'FLOAT64': return view.getFloat64(0, false);
  }
}

export function formatDataValue(value: DataValue): string {
  return typeof value === 'number' && Object.is(value, -0) ? '-0' : value.toString();
}

/** 每两个实际排列后的字节形成一个寄存器，不额外交换顺序。 */
export function bytesToRegisters(data: ByteInput): number[] {
  assertBytes(data);
  if (data.length === 0 || data.length % 2 !== 0) {
    throw new RangeError('寄存器数据必须包含非空且为偶数数量的字节');
  }
  return Array.from({ length: data.length / 2 }, (_, index) => (data[index * 2] << 8) | data[index * 2 + 1]);
}
