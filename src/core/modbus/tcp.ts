import { parseHexBytes } from '../hex';
import { buildModbusBody, type BuiltFrame, type FrameField, type FrameInput, type FrameType } from './builder';
import { parseModbusBody, parseFrameRules, type ParsedBody, type ParseRule } from './parser';

export type TcpFrameInput = FrameInput & { transactionId: number };
export interface BuiltTcpFrame extends BuiltFrame { transactionId: number; protocolId: number; length: number }
export interface ParsedTcpFrame extends ParsedBody { transactionId: number; protocolId: number; length: number; checksum?: undefined }
const word = (value: number): number[] => [value >>> 8, value & 255];
const relocate = (field: FrameField): FrameField => ({ ...field, offset: field.offset + 6 });

function headerFields(transactionId: number, protocolId: number, length: number): FrameField[] {
  return [
    { name: '事务标识', offset: 0, bytes: word(transactionId), description: `${transactionId}；用于关联请求与响应` },
    { name: '协议标识', offset: 2, bytes: word(protocolId), description: protocolId === 0 ? 'Modbus（固定为 0000）' : '非法协议标识，Modbus 必须为 0000' },
    { name: '长度', offset: 4, bytes: word(length), description: `${length} 字节，包含单元标识与 PDU` },
  ];
}

/** MBAP 的长度从单元标识开始；TCP 不追加 CRC / LRC。 */
export function buildTcpFrame(input: TcpFrameInput): BuiltTcpFrame {
  if (!Number.isInteger(input.transactionId) || input.transactionId < 0 || input.transactionId > 65535) { throw new RangeError('事务标识必须是 0～65535 的整数'); }
  const body = buildModbusBody(input, 'tcp');
  const length = body.bytes.length;
  return { ...body, transactionId: input.transactionId, protocolId: 0, length, bytes: [...word(input.transactionId), 0, 0, ...word(length), ...body.bytes], fields: [...headerFields(input.transactionId, 0, length), ...body.fields.map(relocate)] };
}

/** 单条完整 TCP ADU；长度不符时诊断，不将尾部多余字节当作首帧业务数据。 */
export function parseTcpFrame(input: string, frameType: FrameType | 'auto' = 'auto', rules: readonly ParseRule[] = []): ParsedTcpFrame {
  const bytes = parseHexBytes(input);
  if (bytes.length < 8) { throw new Error('TCP 报文至少需要 7 字节 MBAP 头和 1 字节功能码'); }
  const readWord = (offset: number) => bytes[offset]! * 256 + bytes[offset + 1]!;
  const transactionId = readWord(0);
  const protocolId = readWord(2);
  const length = readWord(4);
  // 长度非法时仍保留必需的单元标识和功能码用于诊断，不补齐缺失数据。
  const bodyEnd = Math.min(bytes.length, 6 + Math.max(2, length));
  const body = parseModbusBody(bytes.slice(6, bodyEnd), frameType, 'tcp');
  if (protocolId !== 0) { body.errors.push('协议标识必须为 0000'); }
  if (length < 2 || length > 254) { body.errors.push('MBAP 长度必须为 2～254 字节（单元标识与 PDU）'); }
  if (bytes.length !== 6 + length) { body.errors.push(`MBAP 声明完整长度为 ${6 + length} 字节，实际为 ${bytes.length} 字节；报文截断或包含多余字节`); }
  if (bytes.length > 260) { body.errors.push('TCP 单条报文不能超过 260 字节'); }
  const fields = [...headerFields(transactionId, protocolId, length), ...body.fields.map(relocate)];
  if (bodyEnd < bytes.length) { fields.push({ name: '多余字节', offset: bodyEnd, bytes: bytes.slice(bodyEnd), description: '不属于声明的首条报文，未参与业务解析' }); }
  const payload = body.payload ? { ...body.payload, fields: body.payload.fields.map(relocate), registers: body.payload.registers.map(item => ({ ...item, offset: item.offset + 6 })), states: body.payload.states.map(item => ({ ...item, offset: item.offset + 6 })) } : undefined;
  return { ...body, bytes, transactionId, protocolId, length, payload, fields, rules: parseFrameRules(bytes, rules) };
}
