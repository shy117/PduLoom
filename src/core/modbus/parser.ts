import { parseHexBytes } from '../hex';
import { verifyCrc16, type Crc16Verification } from '../checksum/crc16';
import { decodeDataValue, formatDataValue, getByteLength, type DataType, type ByteOrder } from '../data-conversion';
import { functionCodes, exceptionCodes, type FrameType, type FrameField } from './builder';

export interface ParseRule { name: string; offset: number; type: DataType; order: ByteOrder }
export interface RuleResult extends ParseRule { bytes: number[]; value?: string; error?: string }
export interface ParsedPayload {
  frameType: FrameType;
  fields: FrameField[];
  errors: string[];
  warnings: string[];
  registers: { offset: number; value: number; address?: number }[];
  states: { offset: number; bit: number; value: boolean; address?: number }[];
}
export interface ParsedBody {
  bytes: number[];
  unitId: number;
  functionCode: number;
  supported: boolean;
  candidates: FrameType[];
  payload?: ParsedPayload;
  fields: FrameField[];
  errors: string[];
  warnings: string[];
  rules: RuleResult[];
}
export interface FrameChecksum { algorithm: 'CRC16' | 'LRC'; valid: boolean; received: number; calculated: number }
export interface ParsedMessage extends ParsedBody { checksum: FrameChecksum }
export interface ParsedFrame extends ParsedMessage { crc: Crc16Verification }

/** 偏移针对完整帧；单条规则失败不阻止其他规则，64 位整数直接格式化 bigint。 */
export function parseFrameRules(bytes: readonly number[], rules: readonly ParseRule[]): RuleResult[] {
  return rules.map(rule => {
    const result: RuleResult = { ...rule, bytes: [] };
    try {
      const length = getByteLength(rule.type);
      if (!Number.isInteger(rule.offset) || rule.offset < 0) { throw new Error('偏移必须是非负整数'); }
      if (rule.offset + length > bytes.length) { throw new Error('规则超出完整报文范围'); }
      result.bytes = bytes.slice(rule.offset, rule.offset + length);
      result.value = formatDataValue(decodeDataValue(result.bytes, rule.type, rule.order));
    } catch (cause) { result.error = cause instanceof Error ? cause.message : '规则解析失败'; }
    return result;
  });
}

function parsePayload(bytes: readonly number[], frameType: FrameType): ParsedPayload {
  const code = bytes[1]!;
  const end = bytes.length;
  const result: ParsedPayload = { frameType, fields: [], errors: [], warnings: [], registers: [], states: [] };
  const error = (message: string) => { result.errors.push(message); };
  const field = (name: string, offset: number, length: number, description = '') => {
    if (offset + length > end) { error(`${name}数据不完整`); return; }
    result.fields.push({ name, offset, bytes: bytes.slice(offset, offset + length), description });
  };
  const word = (offset: number): number | undefined => offset + 2 <= end ? bytes[offset]! * 256 + bytes[offset + 1]! : undefined;
  const exact = (length: number) => { if (bytes.length !== length) { error(`当前类型应为 ${length} 字节，实际为 ${bytes.length} 字节`); } };
  const addressQuantity = (max: number): number | undefined => {
    const address = word(2);
    const quantity = word(4);
    field('起始协议地址', 2, 2, address === undefined ? '' : String(address));
    field('数量', 4, 2, quantity === undefined ? '' : String(quantity));
    if (quantity !== undefined && (quantity < 1 || quantity > max)) { error(`数量必须为 1～${max}`); }
    if (address !== undefined && quantity !== undefined && address + quantity > 65536) { error('末尾协议地址超过 65535'); }
    return quantity;
  };
  if (frameType === 'exception') {
    exact(3);
    if ((code & 0x80) === 0) { error('异常响应功能码必须设置最高位'); }
    const exception = end > 2 ? bytes[2] : undefined;
    const known = exceptionCodes.find(item => item.code === exception);
    field('异常码', 2, 1, known?.name ?? '未知异常码');
    if (exception !== undefined && !known) { result.warnings.push(`未知异常码 ${exception}`); }
    return result;
  }
  if ((code & 0x80) !== 0) { error('所选类型与异常功能码不一致'); return result; }
  const request = frameType === 'request';
  if (code >= 1 && code <= 4 && request) {
    exact(6); addressQuantity(code <= 2 ? 2000 : 125);
  } else if (code === 5 || code === 6) {
    exact(6);
    field('协议地址', 2, 2, String(word(2) ?? ''));
    const value = word(4);
    field(code === 5 ? '线圈状态' : '寄存器值', 4, 2, code === 5 ? value === 0xff00 ? '开启' : value === 0 ? '关闭' : '非法状态' : String(value ?? ''));
    if (code === 5 && value !== undefined && value !== 0 && value !== 0xff00) { error('线圈状态必须为 FF00 或 0000'); }
  } else if ((code === 15 || code === 16) && !request) {
    exact(6); addressQuantity(code === 15 ? 1968 : 123);
  } else {
    const write = code === 15 || code === 16;
    const coils = code === 1 || code === 2 || code === 15;
    const quantity = write ? addressQuantity(coils ? 1968 : 123) : undefined;
    const countOffset = write ? 6 : 2;
    const dataOffset = countOffset + 1;
    const count = countOffset < end ? bytes[countOffset] : undefined;
    field('数据字节数', countOffset, 1, String(count ?? ''));
    if (count === undefined) { return result; }
    exact(dataOffset + count);
    if (write && quantity !== undefined && count !== (coils ? Math.ceil(quantity / 8) : quantity * 2)) { error('数据字节数与数量不一致'); }
    if (!write && (count < 1 || count > 250 || (!coils && count % 2 !== 0))) { error('响应数据字节数非法'); }
    const available = Math.min(count, Math.max(0, end - dataOffset));
    field(coils ? '状态数据' : '寄存器数据', dataOffset, available, `${available} 字节`);
    const address = write ? word(2) : undefined;
    if (coils) {
      const size = write ? Math.min(quantity ?? 0, available * 8) : available * 8;
      for (let index = 0; index < size; index++) {
        const offset = dataOffset + Math.floor(index / 8);
        result.states.push({ offset, bit: index % 8, value: (bytes[offset]! & (1 << (index % 8))) !== 0, address: address === undefined ? undefined : address + index });
      }
      if (!write) { result.warnings.push('响应不包含请求数量，末字节可能包含填充位；状态序号不代表协议地址'); }
      if (write && quantity && count === Math.ceil(quantity / 8) && available === count && quantity % 8 !== 0 && (bytes[dataOffset + count - 1]! >>> (quantity % 8)) !== 0) { error('末字节未使用的状态位必须为零'); }
    } else {
      for (let index = 0; index + 1 < available; index += 2) {
        result.registers.push({ offset: dataOffset + index, value: word(dataOffset + index)!, address: address === undefined ? undefined : address + index / 2 });
      }
      if (!write) { result.warnings.push('响应不包含起始地址，寄存器按序号展示'); }
    }
  }
  return result;
}

/** 共用业务解析，不包含传输头及校验，偏移从设备标识开始。 */
export function parseModbusBody(bytes: number[], frameType: FrameType | 'auto' = 'auto', transport: 'serial' | 'tcp' = 'serial'): ParsedBody {
  if (!['auto', 'request', 'response', 'exception'].includes(frameType)) { throw new Error('不支持的报文类型'); }
  if (bytes.length < 2) { throw new Error('业务数据至少需要从站地址和功能码'); }
  const unitId = bytes[0]!;
  const functionCode = bytes[1]!;
  const baseCode = functionCode & 0x7f;
  const supported = functionCodes.some(code => code === baseCode);
  const functionNames: Record<number, string> = { 1: '读取线圈', 2: '读取离散输入', 3: '读取保持寄存器', 4: '读取输入寄存器', 5: '写单个线圈', 6: '写单个寄存器', 15: '写多个线圈', 16: '写多个寄存器' };
  const fields: FrameField[] = [
    { name: transport === 'tcp' ? '单元标识' : '从站地址', offset: 0, bytes: bytes.slice(0, 1), description: transport === 'serial' && unitId === 0 ? '广播地址' : String(unitId) },
    { name: '功能码', offset: 1, bytes: bytes.slice(1, 2), description: functionCode & 0x80 ? `异常响应，原功能码 ${baseCode.toString(16).toUpperCase().padStart(2, '0')}；${functionNames[baseCode] ?? '未支持的功能'}` : functionNames[baseCode] ?? '未支持的功能' },
  ];
  const result: ParsedBody = { bytes, unitId, functionCode, supported, candidates: [], fields, errors: [], warnings: [], rules: [] };
  if (transport === 'serial' && unitId > 247) { result.errors.push('从站地址必须为 0～247'); }
  if (baseCode === 0) { result.errors.push('功能码 00 非法'); }
  const broadcastCheck = (type: FrameType) => transport === 'serial' && unitId === 0 && (type !== 'request' || ![5, 6, 15, 16].includes(functionCode));
  if (supported) {
    const types: FrameType[] = functionCode & 0x80 ? ['exception'] : ['request', 'response'];
    const parsed = types.map(type => parsePayload(bytes, type));
    result.candidates = parsed.filter(item => item.errors.length === 0 && !broadcastCheck(item.frameType)).map(item => item.frameType);
    if (frameType !== 'auto') { result.payload = parsePayload(bytes, frameType); }
    else if (result.candidates.length === 1) { result.payload = parsed.find(item => item.frameType === result.candidates[0]); }
    else if (result.candidates.length > 1) { result.payload = parsed[0]; result.warnings.push('请求与正常响应均符合结构，无法确定方向，请手动选择报文类型'); }
    else { result.errors.push('报文不符合支持的请求或响应结构，请选择报文类型查看具体原因'); }
    if (result.payload) {
      result.errors.push(...result.payload.errors);
      result.warnings.push(...result.payload.warnings);
      fields.push(...result.payload.fields);
      if (broadcastCheck(result.payload.frameType)) { result.errors.push('广播地址仅允许写请求，不允许读取或响应'); }
    } else if (transport === 'serial' && unitId === 0) { result.errors.push('广播地址仅允许合法的写请求'); }
  } else { result.warnings.push('暂不支持该功能码的详细解析'); }
  if (!result.payload) { fields.push({ name: '原始数据', offset: 2, bytes: bytes.slice(2), description: '未进行详细解析' }); }
  return result;
}

/** 保留串行入口，TCP 不套用串行广播规则。 */
export function parseSerialBody(bytes: number[], frameType: FrameType | 'auto' = 'auto'): ParsedBody { return parseModbusBody(bytes, frameType, 'serial'); }

/** RTU 校验与业务结构分别诊断，保留原有 crc 接口。 */
export function parseRtuFrame(input: string, frameType: FrameType | 'auto' = 'auto', rules: readonly ParseRule[] = []): ParsedFrame {
  const bytes = parseHexBytes(input);
  if (bytes.length < 4) { throw new Error('RTU 报文至少需要从站地址、功能码和两个 CRC 字节'); }
  const body = parseSerialBody(bytes.slice(0, -2), frameType);
  const crc = verifyCrc16(bytes);
  if (bytes.length > 256) { body.errors.push('RTU 报文不能超过 256 字节'); }
  return { ...body, bytes, crc, checksum: { algorithm: 'CRC16', valid: crc.valid, received: crc.receivedCrc, calculated: crc.calculatedCrc }, rules: parseFrameRules(bytes, rules), fields: [...body.fields, { name: 'CRC16', offset: bytes.length - 2, bytes: bytes.slice(-2), description: crc.valid ? '校验通过，低字节在前' : '校验失败，低字节在前' }] };
}
