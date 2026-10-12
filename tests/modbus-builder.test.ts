import { describe, expect, it } from 'vitest';
import { buildRtuFrame, functionCodes, packCoilStates, encodeRegisterItems, type FrameInput, type RegisterItem } from '../src/core/modbus/builder';
import { parseHexBytes } from '../src/core/hex';

const values = (...numbers: number[]): RegisterItem[] => numbers.map(value => ({ type: 'UINT16', order: 'AB', value: String(value) }));
const coilExample = [true, false, true, true, false, false, true, true, true, false];
const defaultRead: FrameInput = { unitId: 1, frameType: 'request', functionCode: 3, address: 0, quantity: 2 };

describe('Modbus RTU 组帧', () => {
  // PDU 标准向量：Modbus Application Protocol V1.1b3 各功能码示例。
  // https://www.modbus.org/file/secure/modbusprotocolspecification.pdf
  // 请求/响应业务字段独立与规范比较，CRC 封装另用固定完整报文验证。
  const vectors: [string, FrameInput, string][] = [
    ['01 请求', { unitId: 1, frameType: 'request', functionCode: 1, address: 19, quantity: 19 }, '01 00 13 00 13'],
    ['01 响应', { unitId: 1, frameType: 'response', functionCode: 1, states: [true, false, true, true, false, false, true, true, true, true, false, true, false, true, true, false, true, false, true] }, '01 03 CD 6B 05'],
    ['02 请求', { unitId: 1, frameType: 'request', functionCode: 2, address: 196, quantity: 22 }, '02 00 C4 00 16'],
    ['02 响应', { unitId: 1, frameType: 'response', functionCode: 2, states: [false, false, true, true, false, true, false, true, true, true, false, true, true, false, true, true, true, false, true, false, true, true] }, '02 03 AC DB 35'],
    ['03 请求', { unitId: 1, frameType: 'request', functionCode: 3, address: 107, quantity: 3 }, '03 00 6B 00 03'],
    ['03 响应', { unitId: 1, frameType: 'response', functionCode: 3, items: values(555, 0, 100) }, '03 06 02 2B 00 00 00 64'],
    ['04 请求', { unitId: 1, frameType: 'request', functionCode: 4, address: 8, quantity: 1 }, '04 00 08 00 01'],
    ['04 响应', { unitId: 1, frameType: 'response', functionCode: 4, items: values(10) }, '04 02 00 0A'],
    ['05 请求', { unitId: 1, frameType: 'request', functionCode: 5, address: 172, state: true }, '05 00 AC FF 00'],
    ['05 响应', { unitId: 1, frameType: 'response', functionCode: 5, address: 172, state: true }, '05 00 AC FF 00'],
    ['06 请求', { unitId: 1, frameType: 'request', functionCode: 6, address: 1, value: 3 }, '06 00 01 00 03'],
    ['06 响应', { unitId: 1, frameType: 'response', functionCode: 6, address: 1, value: 3 }, '06 00 01 00 03'],
    ['0F 请求', { unitId: 1, frameType: 'request', functionCode: 15, address: 19, states: coilExample }, '0F 00 13 00 0A 02 CD 01'],
    ['0F 响应', { unitId: 1, frameType: 'response', functionCode: 15, address: 19, quantity: 10 }, '0F 00 13 00 0A'],
    ['10 请求', { unitId: 1, frameType: 'request', functionCode: 16, address: 1, items: values(10, 258) }, '10 00 01 00 02 04 00 0A 01 02'],
    ['10 响应', { unitId: 1, frameType: 'response', functionCode: 16, address: 1, quantity: 2 }, '10 00 01 00 02'],
  ];
  it.each(vectors)('%s 与官方示例 PDU 一致', (_, input, expected) => {
    expect(buildRtuFrame(input).pdu).toEqual(parseHexBytes(expected));
  });
  it('固定完整请求包含正确地址及低字节在前的 CRC', () => {
    const result = buildRtuFrame(defaultRead);
    expect(result.bytes).toEqual(parseHexBytes('01 03 00 00 00 02 C4 0B'));
    expect(result.fields.map(field => [field.name, field.offset])).toEqual([
      ['从站地址', 0], ['功能码', 1], ['起始协议地址', 2], ['读取数量', 4], ['CRC16', 6],
    ]);
    expect(result.fields.flatMap(field => field.bytes)).toEqual(result.bytes);
  });
  it.each(functionCodes)('功能码 %i 的异常响应自动设置最高位', functionCode => {
    const result = buildRtuFrame({ unitId: 1, frameType: 'exception', functionCode, exceptionCode: 2 });
    expect(result.pdu).toEqual([functionCode | 128, 2]);
    expect(result.bytes.length).toBe(5);
  });
  it('混合类型按完整字节编码，数量以寄存器而非数据项计算', () => {
    const items: RegisterItem[] = [...values(20), { type: 'FLOAT32', order: 'ABCD', value: '1' }, { type: 'INT32', order: 'CDAB', value: '-10' }];
    const result = buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 16, address: 100, items });
    expect(result.pdu).toEqual(parseHexBytes('10 00 64 00 05 0A 00 14 3F 80 00 00 FF F6 FF FF'));
    expect(result.quantity).toBe(5);
    expect(result.fields.filter(field => field.name.startsWith('数据项')).map(field => field.description)).toEqual([
      '协议地址 100～100；UINT16 / AB；实际值 20',
      '协议地址 101～102；FLOAT32 / ABCD；实际值 1',
      '协议地址 103～104；INT32 / CDAB；实际值 -10',
    ]);
    const response = buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 3, items });
    expect(response.pdu).toEqual(parseHexBytes('03 0A 00 14 3F 80 00 00 FF F6 FF FF'));
    expect(response.fields.some(field => field.name.includes('地址') && field.name !== '从站地址')).toBe(false);
  });
  it('删除中间数据项后按剩余内容重新组帧，64 位值不丢失精度', () => {
    const items: RegisterItem[] = [...values(20), { type: 'FLOAT32', order: 'ABCD', value: '1' }, { type: 'UINT64', order: 'ABCDEFGH', value: '9007199254740993' }];
    const result = buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 16, address: 100, items: [items[0], items[2]] });
    expect(result.pdu).toEqual(parseHexBytes('10 00 64 00 05 0A 00 14 00 20 00 00 00 00 00 01'));
    expect(result.fields.find(field => field.name === '数据项 2')?.description).toContain('协议地址 101～104');
  });
  it('线圈从低位打包，尾部高位补零，关闭值为 0000', () => {
    expect(packCoilStates(coilExample)).toEqual([205, 1]);
    expect(packCoilStates([true])).toEqual([1]);
    expect(packCoilStates(new Array<boolean>(9).fill(true))).toEqual([255, 1]);
    expect(buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 5, address: 0, state: false }).pdu).toEqual([5, 0, 0, 0, 0]);
  });
  it('仅写请求允许广播，读取和响应拒绝地址 0', () => {
    for (const [, input] of vectors) {
      const broadcast = { ...input, unitId: 0 };
      if (input.frameType === 'request' && input.functionCode >= 5) {
        expect(buildRtuFrame(broadcast).bytes[0]).toBe(0);
      } else {
        expect(() => buildRtuFrame(broadcast)).toThrow(/从站地址/);
      }
    }
    expect(() => buildRtuFrame({ unitId: 0, frameType: 'exception', functionCode: 16, exceptionCode: 2 })).toThrow();
  });
  it('数量和地址允许边界值，拒绝越界、非整数及零数量', () => {
    for (const functionCode of [1, 2, 3, 4] as const) {
      const max = functionCode <= 2 ? 2000 : 125;
      expect(buildRtuFrame({ ...defaultRead, functionCode, quantity: max }).quantity).toBe(max);
      expect(buildRtuFrame({ ...defaultRead, functionCode, address: 65535, quantity: 1 }).quantity).toBe(1);
      for (const quantity of [0, max + 1, -1, 1.5, NaN]) {
        expect(() => buildRtuFrame({ ...defaultRead, functionCode, quantity })).toThrow();
      }
    }
    for (const address of [-1, 65536, 1.5, NaN]) {
      expect(() => buildRtuFrame({ ...defaultRead, address })).toThrow();
    }
    expect(() => buildRtuFrame({ ...defaultRead, address: 65535 })).toThrow(/末尾/);
    for (const unitId of [-1, 248, 1.5, NaN]) {
      expect(() => buildRtuFrame({ ...defaultRead, unitId })).toThrow(/从站地址/);
    }
  });
  it('多寄存器请求上限 123，读取响应上限 125，空列表和越界地址报错', () => {
    const items = values(...new Array<number>(125).fill(0));
    expect(buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 3, items }).bytes.length).toBe(255);
    expect(buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 16, address: 0, items: items.slice(0, 123) }).bytes.length).toBe(255);
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 16, address: 0, items })).toThrow(/寄存器数量/);
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 4, items: [...items, ...values(0)] })).toThrow();
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 16, address: 65535, items: values(0, 0) })).toThrow(/末尾/);
    expect(() => encodeRegisterItems([])).toThrow(/至少/);
    expect(() => encodeRegisterItems([...values(0), { type: 'UINT16', order: 'AB', value: '-1' }])).toThrow(/第 2 项/);
  });
  it('线圈列表与写入确认严格限制数量', () => {
    const states = new Array<boolean>(2000).fill(true);
    expect(buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 1, states }).bytes.length).toBe(255);
    expect(buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 15, address: 0, states: states.slice(0, 1968) }).bytes.length).toBe(255);
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 15, address: 0, states })).toThrow();
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 2, states: [...states, true] })).toThrow();
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 1, states: [] })).toThrow();
    for (const functionCode of [15, 16] as const) {
      const max = functionCode === 15 ? 1968 : 123;
      expect(buildRtuFrame({ unitId: 1, frameType: 'response', functionCode, address: 0, quantity: max }).quantity).toBe(max);
      expect(() => buildRtuFrame({ unitId: 1, frameType: 'response', functionCode, address: 0, quantity: max + 1 })).toThrow();
    }
  });
  it('单寄存器范围、异常码及不支持的功能码均校验', () => {
    for (const value of [-1, 65536, 1.5, NaN]) {
      expect(() => buildRtuFrame({ unitId: 1, frameType: 'request', functionCode: 6, address: 0, value })).toThrow(/寄存器值/);
    }
    expect(() => buildRtuFrame({ unitId: 1, frameType: 'exception', functionCode: 3, exceptionCode: 0 })).toThrow(/异常码/);
    expect(() => buildRtuFrame({ ...defaultRead, functionCode: 7 } as unknown as FrameInput)).toThrow(/功能码/);
    expect(() => buildRtuFrame({ ...defaultRead, frameType: 'invalid' } as unknown as FrameInput)).toThrow(/报文类型/);
    const frozen = Object.freeze(values(20).map(item => Object.freeze(item)));
    buildRtuFrame({ unitId: 1, frameType: 'response', functionCode: 3, items: frozen });
    expect(frozen[0].value).toBe('20');
  });
});
