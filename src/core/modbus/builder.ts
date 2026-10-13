import { calculateCrc16 } from '../checksum/crc16';
import { formatCrc16Bytes } from '../checksum/crc16-format';
import { encodeDataValue, decodeDataValue, formatDataValue, type DataType, type ByteOrder } from '../data-conversion';

export const functionCodes = [1, 2, 3, 4, 5, 6, 15, 16] as const;
export type FunctionCode = typeof functionCodes[number];
export type FrameType = 'request' | 'response' | 'exception';
export interface RegisterItem { type: DataType; order: ByteOrder; value: string }
export const exceptionCodes = [
  { code: 1, name: '非法功能' }, { code: 2, name: '非法数据地址' },
  { code: 3, name: '非法数据值' }, { code: 4, name: '从站设备故障' },
  { code: 5, name: '确认（处理中）' }, { code: 6, name: '从站设备忙' },
  { code: 8, name: '存储器奇偶校验错误' }, { code: 10, name: '网关路径不可用' },
  { code: 11, name: '网关目标设备无响应' },
] as const;

type Payload =
  | { frameType: 'request'; functionCode: 1 | 2 | 3 | 4; address: number; quantity: number }
  | { frameType: 'response'; functionCode: 1 | 2; states: readonly boolean[] }
  | { frameType: 'response'; functionCode: 3 | 4; items: readonly RegisterItem[] }
  | { frameType: 'request' | 'response'; functionCode: 5; address: number; state: boolean }
  | { frameType: 'request' | 'response'; functionCode: 6; address: number; value: number }
  | { frameType: 'request'; functionCode: 15; address: number; states: readonly boolean[] }
  | { frameType: 'request'; functionCode: 16; address: number; items: readonly RegisterItem[] }
  | { frameType: 'response'; functionCode: 15 | 16; address: number; quantity: number }
  | { frameType: 'exception'; functionCode: FunctionCode; exceptionCode: number };
export type FrameInput = { unitId: number } & Payload;
export interface FrameField { name: string; offset: number; bytes: number[]; description: string }
export interface BuiltFrame { bytes: number[]; pdu: number[]; fields: FrameField[]; quantity?: number }

function integer(value: number, name: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name}必须是 ${min}～${max} 的整数`);
  }
}
function addressRange(address: number, quantity: number): void {
  integer(address, '协议地址', 0, 65535);
  if (address + quantity > 65536) {
    throw new RangeError('末尾协议地址不能超过 65535');
  }
}
const word = (value: number): number[] => [value >>> 8, value & 255];

/** 第一个线圈放在首字节最低位，尾部未使用位保持为零。 */
export function packCoilStates(states: readonly boolean[]): number[] {
  const bytes = new Array<number>(Math.ceil(states.length / 8)).fill(0);
  states.forEach((state, index) => {
    if (typeof state !== 'boolean') {
      throw new Error(`第 ${index + 1} 项状态必须为开启或关闭`);
    }
    if (state) {
      bytes[Math.floor(index / 8)] |= 1 << (index % 8);
    }
  });
  return bytes;
}

export function encodeRegisterItems(items: readonly RegisterItem[]): { bytes: number[]; parts: number[][]; quantity: number } {
  if (items.length === 0) {
    throw new Error('请至少添加一个数据项');
  }
  const parts = items.map((item, index) => {
    try {
      return encodeDataValue(item.value, item.type, item.order);
    } catch (cause) {
      throw new Error(`第 ${index + 1} 项：${cause instanceof Error ? cause.message : '数据编码失败'}`);
    }
  });
  const bytes = parts.flat();
  return { bytes, parts, quantity: bytes.length / 2 };
}

/** 共用业务结构：设备标识与 PDU，传输格式决定设备标识规则。 */
export function buildModbusBody(input: FrameInput, transport: 'serial' | 'tcp' = 'serial'): BuiltFrame {
  if (!functionCodes.includes(input.functionCode)) {
    throw new Error('不支持的功能码');
  }
  if (!['request', 'response', 'exception'].includes(input.frameType)) {
    throw new Error('不支持的报文类型');
  }
  const broadcastAllowed = input.frameType === 'request' && [5, 6, 15, 16].includes(input.functionCode);
  integer(input.unitId, transport === 'tcp' ? '单元标识' : '从站地址', transport === 'tcp' ? 0 : broadcastAllowed ? 0 : 1, transport === 'tcp' ? 255 : 247);
  const bytes: number[] = [];
  const fields: FrameField[] = [];
  let quantity: number | undefined;
  const add = (name: string, data: number[], description = '') => {
    fields.push({ name, offset: bytes.length, bytes: data, description });
    bytes.push(...data);
  };
  add(transport === 'tcp' ? '单元标识' : '从站地址', [input.unitId], transport === 'serial' && input.unitId === 0 ? '广播写入，不返回响应' : String(input.unitId));
  add('功能码', [input.functionCode | (input.frameType === 'exception' ? 0x80 : 0)]);
  const addAddressQuantity = (address: number, count: number, max: number, name: string) => {
    integer(count, name, 1, max);
    addressRange(address, count);
    quantity = count;
    add('起始协议地址', word(address), String(address));
    add(name, word(count), String(count));
  };
  const addRegisters = (items: readonly RegisterItem[], address?: number) => {
    const encoded = encodeRegisterItems(items);
    integer(encoded.quantity, '寄存器数量', 1, address === undefined ? 125 : 123);
    quantity = encoded.quantity;
    if (address !== undefined) {
      addAddressQuantity(address, quantity, 123, '写入数量');
    }
    add('数据字节数', [encoded.bytes.length], String(encoded.bytes.length));
    let registerOffset = 0;
    encoded.parts.forEach((part, index) => {
      const item = items[index];
      const count = part.length / 2;
      const location = address === undefined
        ? `寄存器序号 ${registerOffset + 1}～${registerOffset + count}`
        : `协议地址 ${address + registerOffset}～${address + registerOffset + count - 1}`;
      const value = formatDataValue(decodeDataValue(part, item.type, item.order));
      add(`数据项 ${index + 1}`, part, `${location}；${item.type} / ${item.order}；实际值 ${value}`);
      registerOffset += count;
    });
  };
  if (input.frameType === 'exception') {
    const exception = exceptionCodes.find(item => item.code === input.exceptionCode);
    if (!exception) {
      throw new Error('请选择有效的异常码');
    }
    add('异常码', [exception.code], exception.name);
  } else {
    switch (input.functionCode) {
      case 1:
      case 2:
        if (input.frameType === 'request') {
          addAddressQuantity(input.address, input.quantity, 2000, '读取数量');
        } else {
          integer(input.states.length, '状态数量', 1, 2000);
          quantity = input.states.length;
          const packed = packCoilStates(input.states);
          add('数据字节数', [packed.length], String(packed.length));
          add('状态数据', packed, `${quantity} 个状态，最低位对应第一项，尾部未使用位补零`);
        }
        break;
      case 3:
      case 4:
        if (input.frameType === 'request') {
          addAddressQuantity(input.address, input.quantity, 125, '读取数量');
        } else {
          addRegisters(input.items);
        }
        break;
      case 5:
        addressRange(input.address, 1);
        if (typeof input.state !== 'boolean') {
          throw new Error('线圈状态必须为开启或关闭');
        }
        add('线圈协议地址', word(input.address), String(input.address));
        add('线圈状态', input.state ? [255, 0] : [0, 0], input.state ? '开启' : '关闭');
        break;
      case 6:
        addressRange(input.address, 1);
        integer(input.value, '寄存器值', 0, 65535);
        add('寄存器协议地址', word(input.address), String(input.address));
        add('寄存器值', word(input.value), String(input.value));
        break;
      case 15:
        if (input.frameType === 'request') {
          addAddressQuantity(input.address, input.states.length, 1968, '写入数量');
          const packed = packCoilStates(input.states);
          add('数据字节数', [packed.length], String(packed.length));
          add('线圈数据', packed, '最低位对应第一项，尾部未使用位补零');
        } else {
          addAddressQuantity(input.address, input.quantity, 1968, '写入数量');
        }
        break;
      case 16:
        if (input.frameType === 'request') {
          addRegisters(input.items, input.address);
        } else {
          addAddressQuantity(input.address, input.quantity, 123, '写入数量');
        }
        break;
    }
  }
  const pdu = bytes.slice(1);
  return { bytes, pdu, fields, quantity };
}

/** 保留 RTU / ASCII 共用的串行入口。 */
export function buildSerialBody(input: FrameInput): BuiltFrame { return buildModbusBody(input, 'serial'); }

/** RTU 封装固定使用低字节在前的 CRC。 */
export function buildRtuFrame(input: FrameInput): BuiltFrame {
  const body = buildSerialBody(input);
  const crc = formatCrc16Bytes(calculateCrc16(body.bytes));
  return { ...body, bytes: [...body.bytes, ...crc], fields: [...body.fields, { name: 'CRC16', offset: body.bytes.length, bytes: crc, description: '低字节在前' }] };
}
