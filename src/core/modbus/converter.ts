import { calculateCrc16 } from '../checksum/crc16';
import { formatCrc16Bytes } from '../checksum/crc16-format';
import { calculateLrc, formatLrcAsciiFrame } from '../checksum/lrc';
import { parseAsciiFrame } from './ascii';
import { parseRtuFrame, parseModbusBody } from './parser';
import { parseTcpFrame } from './tcp';

export type ModbusFormat = 'rtu' | 'ascii' | 'tcp';
export interface ConvertInput { text: string; source: ModbusFormat; target: ModbusFormat; unitId?: number; transactionId?: number }
export interface ConvertedFrame { bytes: number[]; text: string; pdu: number[]; unitId: number; transactionId?: number; warnings: string[] }
const hex = (bytes: readonly number[], separator = ' ') => bytes.map(byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(separator);

/** 保留 PDU 的每个字节，不按解释后的数值重建；未知业务结构不进行转换。 */
export function convertModbusFrame(input: ConvertInput): ConvertedFrame {
  if (![input.source, input.target].every(format => ['rtu', 'ascii', 'tcp'].includes(format))) { throw new Error('不支持的报文格式'); }
  const type = 'auto';
  const source = input.source === 'tcp' ? parseTcpFrame(input.text, type) : input.source === 'ascii' ? parseAsciiFrame(input.text, type) : parseRtuFrame(input.text, type);
  if (source.checksum && !source.checksum.valid) { throw new Error(`源报文 ${source.checksum.algorithm} 校验失败，不能转换`); }
  if (source.errors.length) { throw new Error(`源报文无效：${source.errors.join('；')}`); }
  if (!source.supported) { throw new Error('该功能码尚未支持业务结构校验，不能转换'); }
  const pdu = input.source === 'tcp' ? source.bytes.slice(7) : source.bytes.slice(1, input.source === 'ascii' ? -1 : -2);
  const unitId = input.unitId ?? source.unitId;
  const maxUnit = input.target === 'tcp' ? 255 : 247;
  if (!Number.isInteger(unitId) || unitId < 0 || unitId > maxUnit) { throw new Error(`目标${input.target === 'tcp' ? '单元标识' : '从站地址'}必须为 0～${maxUnit}，请指定有效的目标设备标识`); }
  const body = [unitId, ...pdu];
  const targetBody = parseModbusBody(body, type, input.target === 'tcp' ? 'tcp' : 'serial');
  if (targetBody.errors.length) { throw new Error(`目标报文不符合地址或业务规则：${targetBody.errors.join('；')}`); }
  const warnings = [...new Set([...source.warnings, ...targetBody.warnings])];
  if (unitId !== source.unitId) { warnings.push(`设备标识由 ${source.unitId} 修改为 ${unitId}；功能码和业务数据保持不变`); }
  if (input.source === 'tcp' && input.target !== 'tcp') { warnings.push('目标串行格式不包含事务标识，源事务标识将被移除'); }
  if (input.target === 'tcp') {
    const transactionId = input.transactionId ?? ('transactionId' in source ? source.transactionId : undefined);
    if (!Number.isInteger(transactionId) || transactionId === undefined || transactionId < 0 || transactionId > 65535) { throw new Error('转换为 TCP 时必须指定 0～65535 的事务标识'); }
    const bytes = [transactionId >>> 8, transactionId & 255, 0, 0, body.length >>> 8, body.length & 255, ...body];
    return { bytes, text: hex(bytes), pdu, unitId, transactionId, warnings };
  }
  const bytes = input.target === 'ascii' ? [...body, calculateLrc(body)] : [...body, ...formatCrc16Bytes(calculateCrc16(body))];
  return { bytes, text: input.target === 'ascii' ? formatLrcAsciiFrame(bytes) : hex(bytes), pdu, unitId, warnings };
}
