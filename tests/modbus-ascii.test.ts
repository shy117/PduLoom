import { describe, expect, it } from 'vitest';
import { buildAsciiFrame, normalizeAsciiTextInput, parseAsciiFrame } from '../src/core/modbus/ascii';
import type { FrameInput, FrameType, RegisterItem } from '../src/core/modbus/builder';
const items = (...values: number[]): RegisterItem[] => values.map(value => ({ type: 'UINT16', order: 'AB', value: String(value) }));
// PDU：Modbus 应用协议 V1.1b3 各功能码示例；LRC 常量独立按字节求和取补码。
const vectors: [FrameType, string, FrameInput][] = [
  ['request', ':010100130013D8', { unitId: 1, functionCode: 1, frameType: 'request', address: 19, quantity: 19 }],
  ['response', ':010103CD6B05BE', { unitId: 1, functionCode: 1, frameType: 'response', states: [true,false,true,true,false,false,true,true,true,true,false,true,false,true,true,false,true,false,true] }],
  ['request', ':010200C4001623', { unitId: 1, functionCode: 2, frameType: 'request', address: 196, quantity: 22 }],
  ['response', ':010203ACDB353E', { unitId: 1, functionCode: 2, frameType: 'response', states: [false,false,true,true,false,true,false,true,true,true,false,true,true,false,true,true,true,false,true,false,true,true] }],
  ['request', ':0103006B00038E', { unitId: 1, functionCode: 3, frameType: 'request', address: 107, quantity: 3 }],
  ['response', ':010306022B0000006465', { unitId: 1, functionCode: 3, frameType: 'response', items: items(555,0,100) }],
  ['request', ':010400080001F2', { unitId: 1, functionCode: 4, frameType: 'request', address: 8, quantity: 1 }],
  ['response', ':010402000AEF', { unitId: 1, functionCode: 4, frameType: 'response', items: items(10) }],
  ['request', ':010500ACFF004F', { unitId: 1, functionCode: 5, frameType: 'request', address: 172, state: true }],
  ['response', ':010500ACFF004F', { unitId: 1, functionCode: 5, frameType: 'response', address: 172, state: true }],
  ['request', ':010600010003F5', { unitId: 1, functionCode: 6, frameType: 'request', address: 1, value: 3 }],
  ['response', ':010600010003F5', { unitId: 1, functionCode: 6, frameType: 'response', address: 1, value: 3 }],
  ['request', ':010F0013000A02CD0103', { unitId: 1, functionCode: 15, frameType: 'request', address: 19, states: [true,false,true,true,false,false,true,true,true,false] }],
  ['response', ':010F0013000AD3', { unitId: 1, functionCode: 15, frameType: 'response', address: 19, quantity: 10 }],
  ['request', ':01100001000204000A0102DB', { unitId: 1, functionCode: 16, frameType: 'request', address: 1, items: items(10,258) }],
  ['response', ':011000010002EC', { unitId: 1, functionCode: 16, frameType: 'response', address: 1, quantity: 2 }],
  ['exception', ':0183027A', { unitId: 1, functionCode: 3, frameType: 'exception', exceptionCode: 2 }],
];
describe('Modbus ASCII', () => {
  it('生成文本粘贴到文本框后，普通解析恢复被归一化的 CRLF', () => {
    const generated = buildAsciiFrame({ unitId: 1, functionCode: 3, frameType: 'request', address: 0, quantity: 2 }).text;
    expect(generated).toBe(':010300000002FA\r\n');
    const textareaValue = generated.replace(/\r\n/g, '\n');
    const parsed = parseAsciiFrame(normalizeAsciiTextInput(textareaValue));
    expect(parsed.errors).toEqual([]);
    expect(parsed.lrc.valid).toBe(true);
    expect(parsed.text).toBe(generated);
  });
  it('文本适配不掩盖缺失结束符、多行或仅 CR 的错误', () => {
    const base = ':010300000002FA';
    for (const text of [base, base + '\r', base + '\r\n', base + '\n\n', base + '\r\n\n']) {
      expect(normalizeAsciiTextInput(text)).toBe(text);
    }
    expect(parseAsciiFrame(normalizeAsciiTextInput(base)).errors.join()).toContain('CRLF');
    expect(() => parseAsciiFrame(normalizeAsciiTextInput(base + '\n\n'))).toThrow();
  });
  it.each(vectors)('%s 独立固定帧 %s', (type, text, input) => {
    const parsed = parseAsciiFrame(text + '\r\n', type);
    expect(parsed.errors).toEqual([]);
    expect(parsed.lrc.valid).toBe(true);
    expect(parsed.fields.flatMap(field => field.bytes)).toEqual(parsed.bytes);
    expect(parsed.payload?.frameType).toBe(type);
    expect(buildAsciiFrame(input).text).toBe(text + '\r\n');
  });
  it('三菱手册表 4.6/4.7 的完整 LRC 向量', () => {
    // https://dl.mitsubishielectric.com/dl/fa/document/manual/plc/sh080578eng/sh080578engk.pdf
    const result = parseAsciiFrame(':020100000008F5\r\n');
    expect(result.checksum).toEqual({ algorithm: 'LRC', valid: true, received: 245, calculated: 245 });
    expect(result.candidates).toEqual(['request']);
  });
  it('结束符缺失或归一化为 LF 时保留字节及校验，同时报告格式错误', () => {
    for (const ending of ['', '\n', '\r']) {
      const result = parseAsciiFrame(':010300000002FA' + ending);
      expect(result.ending).toBe(ending);
      expect(result.lrc.valid).toBe(true);
      expect(result.errors.join()).toContain('CRLF');
    }
    expect(parseAsciiFrame(':010300000002fa\r\n').errors).toEqual([]);
  });
  it.each(['', '010300000002FA\r\n', ' :010300000002FA\r\n', ':01 03\r\n', ':0103G0\r\n', ':010\r\n', ':01\r\n', ':010300000002FA\\r\\n', ':010300000002FA\r\n:010300000002FA\r\n'])('拒绝无效输入 %s', text => {
    expect(() => parseAsciiFrame(text)).toThrow();
  });
  it('LRC 错误仍解析业务字段；校验尾部不进入业务数据', () => {
    const result = parseAsciiFrame(':010302000AFF\r\n');
    expect(result.lrc.valid).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.payload?.registers.map(item => item.value)).toEqual([10]);
    expect(parseAsciiFrame(':01030200FA\r\n', 'response').errors.length).toBeGreaterThan(0);
  });
  it('最大传输长度和业务数量边界', () => {
    const max = ':0103FA' + '00'.repeat(250) + '02\r\n';
    expect(parseAsciiFrame(max).errors).toEqual([]);
    expect(parseAsciiFrame(max).lrc.valid).toBe(true);
    expect(buildAsciiFrame({ unitId: 1, functionCode: 3, frameType: 'response', items: items(...Array<number>(125).fill(0)) }).text).toBe(max);
    expect(parseAsciiFrame(':0103FC' + '00'.repeat(252) + '00\r\n', 'response').errors.join()).toContain('513');
    expect(() => buildAsciiFrame({ unitId: 1, functionCode: 3, frameType: 'response', items: items(...Array<number>(126).fill(0)) })).toThrow();
  });
  it('规则从解码后的从站地址计数，可读取末尾 LRC，越界独立报告', () => {
    const result = parseAsciiFrame(':0103043F800000B9\r\n', 'response', [
      { name: '浮点', offset: 3, type: 'FLOAT32', order: 'ABCD' },
      { name: '越界', offset: 7, type: 'UINT16', order: 'AB' },
    ]);
    expect(result.rules[0]?.value).toBe('1');
    expect(result.rules[1]?.error).toContain('范围');
    expect(result.fields.at(-1)?.offset).toBe(7);
  });
  it('共用广播和自动类型歧义规则', () => {
    expect(parseAsciiFrame(':010600010003F5\r\n').candidates).toEqual(['request', 'response']);
    expect(parseAsciiFrame(':000600010003F6\r\n').candidates).toEqual(['request']);
    expect(parseAsciiFrame(':000300000002FB\r\n', 'request').errors.join()).toContain('广播');
    expect(() => buildAsciiFrame({ unitId: 0, functionCode: 3, frameType: 'request', address: 0, quantity: 2 })).toThrow();
  });
});
