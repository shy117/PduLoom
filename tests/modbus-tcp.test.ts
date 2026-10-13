import { describe, expect, it } from 'vitest';
import { buildTcpFrame, parseTcpFrame } from '../src/core/modbus/tcp';
import { buildRtuFrame, type FrameInput, type FrameType, type RegisterItem } from '../src/core/modbus/builder';
import { parseRtuFrame } from '../src/core/modbus/parser';
import { parseHexBytes } from '../src/core/hex';
const items = (...values: number[]): RegisterItem[] => values.map(value => ({ type: 'UINT16', order: 'AB', value: String(value) }));
// 业务 PDU：官方应用协议 V1.1b3；MBAP：官方 TCP/IP 实现指南 V1.0b。
// https://www.modbus.org/file/secure/modbusprotocolspecification.pdf
// https://www.modbus.org/file/secure/messagingimplementationguide.pdf
const vectors: [FrameType, string, FrameInput][] = [
  ['request', '00 01 00 00 00 06 01 01 00 13 00 13', { unitId: 1, functionCode: 1, frameType: 'request', address: 19, quantity: 19 }],
  ['response', '00 01 00 00 00 06 01 01 03 CD 6B 05', { unitId: 1, functionCode: 1, frameType: 'response', states: [true,false,true,true,false,false,true,true,true,true,false,true,false,true,true,false,true,false,true] }],
  ['request', '00 01 00 00 00 06 01 02 00 C4 00 16', { unitId: 1, functionCode: 2, frameType: 'request', address: 196, quantity: 22 }],
  ['response', '00 01 00 00 00 06 01 02 03 AC DB 35', { unitId: 1, functionCode: 2, frameType: 'response', states: [false,false,true,true,false,true,false,true,true,true,false,true,true,false,true,true,true,false,true,false,true,true] }],
  ['request', '00 01 00 00 00 06 01 03 00 6B 00 03', { unitId: 1, functionCode: 3, frameType: 'request', address: 107, quantity: 3 }],
  ['response', '00 01 00 00 00 09 01 03 06 02 2B 00 00 00 64', { unitId: 1, functionCode: 3, frameType: 'response', items: items(555,0,100) }],
  ['request', '00 01 00 00 00 06 01 04 00 08 00 01', { unitId: 1, functionCode: 4, frameType: 'request', address: 8, quantity: 1 }],
  ['response', '00 01 00 00 00 05 01 04 02 00 0A', { unitId: 1, functionCode: 4, frameType: 'response', items: items(10) }],
  ['request', '00 01 00 00 00 06 01 05 00 AC FF 00', { unitId: 1, functionCode: 5, frameType: 'request', address: 172, state: true }],
  ['response', '00 01 00 00 00 06 01 05 00 AC FF 00', { unitId: 1, functionCode: 5, frameType: 'response', address: 172, state: true }],
  ['request', '00 01 00 00 00 06 01 06 00 01 00 03', { unitId: 1, functionCode: 6, frameType: 'request', address: 1, value: 3 }],
  ['response', '00 01 00 00 00 06 01 06 00 01 00 03', { unitId: 1, functionCode: 6, frameType: 'response', address: 1, value: 3 }],
  ['request', '00 01 00 00 00 09 01 0F 00 13 00 0A 02 CD 01', { unitId: 1, functionCode: 15, frameType: 'request', address: 19, states: [true,false,true,true,false,false,true,true,true,false] }],
  ['response', '00 01 00 00 00 06 01 0F 00 13 00 0A', { unitId: 1, functionCode: 15, frameType: 'response', address: 19, quantity: 10 }],
  ['request', '00 01 00 00 00 0B 01 10 00 01 00 02 04 00 0A 01 02', { unitId: 1, functionCode: 16, frameType: 'request', address: 1, items: items(10,258) }],
  ['response', '00 01 00 00 00 06 01 10 00 01 00 02', { unitId: 1, functionCode: 16, frameType: 'response', address: 1, quantity: 2 }],
];
const read: FrameInput = { unitId: 1, functionCode: 3, frameType: 'request', address: 0, quantity: 2 };
const frame = '00 01 00 00 00 06 01 03 00 00 00 02';
describe('Modbus TCP', () => {
  it.each(vectors)('%s 独立完整 TCP 帧 %s', (type, text, input) => {
    const expected = parseHexBytes(text);
    const built = buildTcpFrame({ ...input, transactionId: 1 });
    expect(built.bytes).toEqual(expected);
    expect(built.pdu).toEqual(expected.slice(7));
    expect(built.fields.flatMap(field => field.bytes)).toEqual(expected);
    const parsed = parseTcpFrame(text, type);
    expect(parsed.errors).toEqual([]);
    expect(parsed.payload?.frameType).toBe(type);
    expect(parsed.fields.flatMap(field => field.bytes)).toEqual(expected);
    expect(parsed.fields.find(field => field.name === '单元标识')?.offset).toBe(6);
    expect(parsed.fields.find(field => field.name === '功能码')?.offset).toBe(7);
    expect(parsed.checksum).toBeUndefined();
  });
  it.each([1,2,3,4,5,6,15,16] as const)('异常响应 %i', functionCode => {
    const bytes = [0,1,0,0,0,3,1,functionCode | 128,2];
    expect(buildTcpFrame({ transactionId: 1, unitId: 1, functionCode, frameType: 'exception', exceptionCode: 2 }).bytes).toEqual(bytes);
    const result = parseTcpFrame(bytes.map(byte => byte.toString(16).padStart(2,'0')).join(' '));
    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual(['exception']);
    expect(result.payload?.fields[0]?.offset).toBe(8);
  });
  it('事务号边界和单元标识允许整个字节范围，串行规则保留', () => {
    for (const transactionId of [0,65535]) {
      for (const unitId of [0,247,248,255]) {
        const built = buildTcpFrame({ ...read, transactionId, unitId });
        const parsed = parseTcpFrame(built.bytes.map(byte => byte.toString(16).padStart(2,'0')).join(' '));
        expect(parsed.transactionId).toBe(transactionId);
        expect(parsed.unitId).toBe(unitId);
        expect(parsed.errors).toEqual([]);
      }
    }
    for (const transactionId of [-1,65536,1.5,NaN]) { expect(() => buildTcpFrame({ ...read, transactionId })).toThrow(/事务标识/); }
    for (const unitId of [-1,256,1.5,NaN]) { expect(() => buildTcpFrame({ ...read, transactionId: 1, unitId })).toThrow(/单元标识/); }
    expect(() => buildRtuFrame({ ...read, unitId: 0 })).toThrow();
    expect(parseRtuFrame('FF 03 00 00 00 02 00 00').errors.join()).toContain('从站地址');
  });
  it('单元标识 0 不按广播处理，05 / 06 保留方向歧义', () => {
    const result = parseTcpFrame('00 01 00 00 00 06 00 06 00 01 00 03');
    expect(result.errors).toEqual([]);
    expect(result.candidates).toEqual(['request','response']);
    expect(parseTcpFrame('00 01 00 00 00 06 00 06 00 01 00 03', 'response').errors).toEqual([]);
  });
  it.each(['', 'GG', '00 01 00 00 00 06 01', '0 01', '0x00'])('非法输入及截断头 %s', text => { expect(() => parseTcpFrame(text)).toThrow(); });
  it('协议号、MBAP 长度、截断及多余字节分别报告', () => {
    expect(parseTcpFrame(frame.replace('00 00 00 06', '00 01 00 06')).errors.join()).toContain('协议标识');
    for (const length of ['00 00', '00 01', '00 FF', 'FF FF']) {
      expect(parseTcpFrame(frame.replace('00 06',length)).errors.join()).toContain('MBAP');
    }
    expect(parseTcpFrame(frame.slice(0,-3), 'request').errors.join()).toContain('截断');
    const extra = parseTcpFrame(frame + ' FF FF', 'request');
    expect(extra.errors.join()).toContain('多余');
    expect(extra.fields.at(-1)?.bytes).toEqual([255,255]);
    expect(extra.payload?.fields.at(-1)?.description).toBe('2');
    expect(parseTcpFrame(frame + ' ' + frame).errors.join()).toContain('多余');
  });
  it('规则、寄存器与状态偏移全部映射到完整 ADU', () => {
    const result = parseTcpFrame('00 01 00 00 00 07 01 03 04 3F 80 00 00', 'response', [
      { name: '浮点', offset: 9, type: 'FLOAT32', order: 'ABCD' },
      { name: '事务号', offset: 0, type: 'UINT16', order: 'AB' },
      { name: '越界', offset: 12, type: 'UINT16', order: 'AB' },
    ]);
    expect(result.rules[0]?.value).toBe('1');
    expect(result.rules[1]?.value).toBe('1');
    expect(result.rules[2]?.error).toContain('范围');
    expect(result.payload?.registers.map(item => item.offset)).toEqual([9,11]);
    const states = parseTcpFrame('00 01 00 00 00 04 01 01 01 05').payload?.states;
    expect(states?.[0]).toEqual({ offset: 9, bit: 0, value: true, address: undefined });
  });
  it('最大业务数据、超长 ADU 和业务数量校验', () => {
    const text = '00 01 00 00 00 FD 01 03 FA ' + '00 '.repeat(250);
    expect(parseTcpFrame(text).errors).toEqual([]);
    const built = buildTcpFrame({ transactionId: 1, unitId: 1, functionCode: 3, frameType: 'response', items: items(...Array<number>(125).fill(0)) });
    expect(built.bytes.length).toBe(259);
    expect(built.bytes).toEqual(parseHexBytes(text));
    expect(parseTcpFrame(text + '00 00').errors.join()).toContain('260');
    expect(parseTcpFrame('00 01 00 00 00 06 01 03 00 00 00 00', 'request').errors.join()).toContain('数量');
    expect(parseTcpFrame('00 01 00 00 00 02 01 07').supported).toBe(false);
  });
});
