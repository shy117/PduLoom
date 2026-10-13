import { describe, expect, it } from 'vitest';
import { parseFrameRules, parseRtuFrame } from '../src/core/modbus/parser';
import type { FrameType } from '../src/core/modbus/builder';

// 独立 PDU 向量来自 Modbus 应用协议 V1.1b3 各功能码示例。
// https://www.modbus.org/file/secure/modbusprotocolspecification.pdf
// 此处零 CRC 有意用于隔离业务结构验证；完整 RTU 校验另用固定向量。
const vectors: [FrameType, string][] = [
  ['request', '01 00 13 00 13'], ['response', '01 03 CD 6B 05'],
  ['request', '02 00 C4 00 16'], ['response', '02 03 AC DB 35'],
  ['request', '03 00 6B 00 03'], ['response', '03 06 02 2B 00 00 00 64'],
  ['request', '04 00 08 00 01'], ['response', '04 02 00 0A'],
  ['request', '05 00 AC FF 00'], ['response', '05 00 AC FF 00'],
  ['request', '06 00 01 00 03'], ['response', '06 00 01 00 03'],
  ['request', '0F 00 13 00 0A 02 CD 01'], ['response', '0F 00 13 00 0A'],
  ['request', '10 00 01 00 02 04 00 0A 01 02'], ['response', '10 00 01 00 02'],
];
const parse = (pdu: string, type: FrameType | 'auto' = 'auto', unit = '01') => parseRtuFrame(`${unit} ${pdu} 00 00`, type);

describe('RTU 解析', () => {
  it.each(vectors)('%s：标准 PDU %s', (type, pdu) => {
    const result = parse(pdu, type);
    expect(result.errors).toEqual([]);
    expect(result.payload?.frameType).toBe(type);
    expect(result.fields.flatMap(field => field.bytes)).toEqual(result.bytes);
  });
  it('固定完整 RTU 向量验证 CRC 与协议字段', () => {
    const result = parseRtuFrame('01 03 00 00 00 02 C4 0B');
    expect(result.crc).toEqual({ valid: true, receivedCrc: 0x0bc4, calculatedCrc: 0x0bc4 });
    expect(result.candidates).toEqual(['request']);
    expect(result.errors).toEqual([]);
    expect(result.fields.find(field => field.name === '数量')?.description).toBe('2');
    expect(parseRtuFrame('010300000002C40B').bytes).toEqual(result.bytes);
    expect(parseRtuFrame('01\n03 0000 0002 C40B').bytes).toEqual(result.bytes);
    const damaged = parseRtuFrame('01 03 00 00 00 02 0B C4');
    expect(damaged.crc.valid).toBe(false);
    expect(damaged.errors).toEqual([]);
    expect(damaged.payload?.fields.length).toBe(2);
  });
  it('独立解码寄存器和状态，读取响应不猜测地址及准确数量', () => {
    const registers = parse('03 06 02 2B 00 00 00 64').payload!.registers;
    expect(registers.map(item => item.value)).toEqual([555, 0, 100]);
    expect(registers[0]).toEqual({ offset: 3, value: 555, address: undefined });
    const states = parse('01 03 CD 6B 05').payload!.states;
    expect(states.length).toBe(24);
    expect(states.slice(0, 8).map(item => item.value)).toEqual([true, false, true, true, false, false, true, true]);
    expect(parse('0F 00 13 00 0A 02 CD 01').payload!.states.at(-1)?.address).toBe(28);
    expect(parse('10 00 01 00 02 04 00 0A 01 02').payload!.registers.map(item => item.address)).toEqual([1, 2]);
  });
  it.each(['05 00 AC FF 00', '06 00 01 00 03', '01 03 00 00 01'])('自动识别保留歧义 %s', pdu => {
    expect(parse(pdu).candidates).toEqual(['request', 'response']);
    expect(parse(pdu).warnings.join()).toContain('无法确定方向');
    expect(parse(pdu, 'response').payload?.frameType).toBe('response');
  });
  it.each(['81', '82', '83', '84', '85', '86', '8F', '90'])('异常功能码 %s', code => {
    const result = parse(`${code} 02`);
    expect(result.candidates).toEqual(['exception']);
    expect(result.payload?.fields[0]?.description).toBe('非法数据地址');
    expect(result.errors).toEqual([]);
    expect(parse(`${code} 02`, 'request').errors.length).toBeGreaterThan(0);
  });
  it('未知异常码保留原值和提示', () => {
    expect(parse('83 7F').warnings.join()).toContain('未知异常码');
    expect(parse('03 02', 'exception').errors.join()).toContain('最高位');
  });
  it.each(['', '0', 'GG', '0x01', '01 03 FF'])('拒绝非法输入 %s', text => { expect(() => parseRtuFrame(text)).toThrow(); });
  it.each([
    ['03 00 00 00 00', 'request'], ['03 00 00 00 7E', 'request'],
    ['01 00 00 07 D1', 'request'], ['03 FF FF 00 02', 'request'],
    ['05 00 00 00 01', 'request'], ['03 03 00 01 02', 'response'],
    ['03 00', 'response'], ['03 02 00', 'response'], ['03 02 00 01 FF', 'response'],
    ['0F 00 00 00 09 01 FF', 'request'], ['0F 00 00 00 09 02 FF FF', 'request'],
    ['10 00 00 00 02 02 00 01', 'request'], ['10 00 00 00 7C', 'response'],
    ['0F 00 00 07 B1', 'response'], ['83', 'exception'], ['83 02 00', 'exception'],
  ] as [string, FrameType][])('拒绝错误结构 %s %s', (pdu, type) => { expect(parse(pdu, type).errors.length).toBeGreaterThan(0); });
  it.each([['01', 2000], ['02', 2000], ['03', 125], ['04', 125]] as const)('读取 %s 数量边界', (code, max) => {
    const count = max.toString(16).padStart(4, '0');
    expect(parse(`${code} 00 00 ${count}`, 'request').errors).toEqual([]);
    expect(parse(`${code} FF FF 00 01`, 'request').errors).toEqual([]);
  });
  it('响应和多写帧支持最大数据长度', () => {
    expect(parse(`03 FA ${'00 '.repeat(250)}`, 'response').errors).toEqual([]);
    expect(parse(`10 00 00 00 7B F6 ${'00 '.repeat(246)}`, 'request').errors).toEqual([]);
    expect(parse(`0F 00 00 07 B0 F6 ${'00 '.repeat(246)}`, 'request').errors).toEqual([]);
    expect(parse(`02 FA ${'FF '.repeat(250)}`, 'response').errors).toEqual([]);
    expect(parse(`03 FC ${'00 '.repeat(252)}`, 'response').errors.join()).toContain('256');
  });
  it('从站地址与广播用途校验', () => {
    expect(parse('06 00 01 00 03', 'auto', '00').candidates).toEqual(['request']);
    expect(parse('06 00 01 00 03', 'response', '00').errors.join()).toContain('广播');
    expect(parse('03 00 00 00 01', 'request', '00').errors.join()).toContain('广播');
    expect(parse('83 02', 'exception', '00').errors.join()).toContain('广播');
    expect(parse('03 00 00 00 01', 'request', 'F8').errors.join()).toContain('从站地址');
  });
  it('未知功能保留原始字节和 CRC，非法功能码报告错误', () => {
    expect(parse('07 00').supported).toBe(false);
    expect(parse('07 00').fields[2]?.bytes).toEqual([0]);
    expect(parse('00').errors.join()).toContain('非法');
    expect(parse('03 02 00').payload).toBeUndefined();
  });
});

describe('完整报文偏移规则', () => {
  it('浮点标准向量、字节序及 64 位整数无精度损失', () => {
    const result = parseFrameRules([0x3f, 0x80, 0, 0, 0, 0x20, 0, 0, 0, 0, 0, 1], [
      { name: '浮点', offset: 0, type: 'FLOAT32', order: 'ABCD' },
      { name: '大整数', offset: 4, type: 'UINT64', order: 'ABCDEFGH' },
      { name: '交换', offset: 0, type: 'UINT16', order: 'BA' },
    ]);
    expect(result.map(item => item.value)).toEqual(['1', '9007199254740993', '32831']);
  });
  it('负偏移、非整数、越界、错误字节序分别报告，不阻止正常规则', () => {
    const rules = [-1, 0.5, NaN, 1, 0].map(offset => ({ name: '', offset, type: 'UINT16' as const, order: 'AB' as const }));
    const result = parseFrameRules([0, 10], rules);
    expect(result.slice(0, 4).every(item => item.error)).toBe(true);
    expect(result[4]?.value).toBe('10');
    expect(parseFrameRules([0, 10], [{ ...rules[4]!, order: 'ABCD' }])[0]?.error).toContain('字节序');
  });
});
