import { calculateLrc, verifyLrc, formatLrcAsciiFrame, type LrcVerification } from '../checksum/lrc';
import { buildSerialBody, type BuiltFrame, type FrameInput, type FrameType } from './builder';
import { parseSerialBody, parseFrameRules, type ParsedMessage, type ParseRule } from './parser';

export interface BuiltAsciiFrame extends BuiltFrame { text: string }
export interface ParsedAsciiFrame extends ParsedMessage { text: string; ending: string; lrc: LrcVerification }

/** 仅用于文本框输入适配：将末尾单个 LF 恢复为 CRLF，不补缺失结束符，不清理其他字符。 */
export function normalizeAsciiTextInput(input: string): string {
  return /[^\r\n]\n$/.test(input) ? input.slice(0, -1) + '\r\n' : input;
}

/** bytes 为解码后的地址、PDU、LRC；text 为实际可复制的完整 ASCII 帧。 */
export function buildAsciiFrame(input: FrameInput): BuiltAsciiFrame {
  const body = buildSerialBody(input);
  const lrc = [calculateLrc(body.bytes)];
  const bytes = [...body.bytes, ...lrc];
  return { ...body, bytes, text: formatLrcAsciiFrame(bytes), fields: [...body.fields, { name: 'LRC', offset: body.bytes.length, bytes: lrc, description: '编码前字节的纵向冗余校验' }] };
}

/** 保留输入结束符；文本框通常把 CRLF 转为 LF，此时仍解码，但报告帧格式错误。 */
export function parseAsciiFrame(input: string, frameType: FrameType | 'auto' = 'auto', rules: readonly ParseRule[] = []): ParsedAsciiFrame {
  if (!input.startsWith(':')) { throw new Error('ASCII 报文必须以冒号开始'); }
  const ending = input.endsWith('\r\n') ? '\r\n' : input.endsWith('\n') ? '\n' : input.endsWith('\r') ? '\r' : '';
  const hex = input.slice(1, ending ? -ending.length : undefined);
  if (!/^[0-9a-f]+$/i.test(hex)) { throw new Error('ASCII 数据区仅允许连续 HEX 字符，不支持空格或多条报文'); }
  if (hex.length % 2 !== 0) { throw new Error('ASCII HEX 字符必须成对'); }
  const bytes = Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  if (bytes.length < 3) { throw new Error('ASCII 报文至少需要从站地址、功能码和 LRC'); }
  const body = parseSerialBody(bytes.slice(0, -1), frameType);
  const lrc = verifyLrc(bytes);
  if (ending !== '\r\n') { body.errors.push('结束符不是标准 CRLF；仍展示解码内容，请检查输入结束符'); }
  if (input.length > 513 || bytes.length > 255) { body.errors.push('ASCII 完整报文不能超过 513 个字符（含冒号和 CRLF）'); }
  return { ...body, bytes, text: input, ending, lrc, checksum: { algorithm: 'LRC', valid: lrc.valid, received: lrc.receivedLrc, calculated: lrc.calculatedLrc }, rules: parseFrameRules(bytes, rules), fields: [...body.fields, { name: 'LRC', offset: bytes.length - 1, bytes: bytes.slice(-1), description: lrc.valid ? '校验通过' : '校验失败' }] };
}
