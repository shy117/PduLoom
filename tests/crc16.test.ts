import { describe, expect, it } from 'vitest';
import { calculateCrc16, verifyCrc16 } from '../src/core/checksum/crc16';

import { formatCrc16Bytes } from '../src/core/checksum/crc16-format';

// CRC 参数来源：https://www.modbus.org/docs/Modbus_over_serial_line_V1_02.pdf
// 123456789 检查值：https://reveng.sourceforge.io/crc-catalogue/16.htm#crc.cat.crc-16-modbus
const readRequest = [0x01, 0x03, 0x00, 0x00, 0x00, 0x02];
const validFrame = [...readRequest, 0xc4, 0x0b];

describe('Modbus CRC16 计算', () => {
  it('标准 ASCII 检查向量 123456789 返回 0x4B37', () => {
    expect(calculateCrc16([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39])).toBe(0x4b37);
  });
  it('固定 Modbus 请求向量返回 0x0BC4，追加低字节在前', () => {
    expect(calculateCrc16(readRequest)).toBe(0x0bc4);
    expect(formatCrc16Bytes(calculateCrc16(readRequest))).toEqual([0xc4, 0x0b]);
  });
  it('支持 Uint8Array，包括非零起点的视图', () => {
    const buffer = new Uint8Array([0xff, ...readRequest, 0xff]);
    expect(calculateCrc16(buffer.subarray(1, -1))).toBe(0x0bc4);
    expect(formatCrc16Bytes(calculateCrc16(new Uint8Array(readRequest)))).toEqual([0xc4, 0x0b]);
  });
  it('空输入保留初始值', () => {
    expect(calculateCrc16([])).toBe(0xffff);
    expect(formatCrc16Bytes(calculateCrc16(new Uint8Array()))).toEqual([0xff, 0xff]);
  });
  it.each([[0x00, 0x40bf], [0xff, 0x00ff]])('单字节边界 %i 返回固定校验值', (byte, crc) => {
    expect(calculateCrc16([byte])).toBe(crc);
  });
  it.each([-1, 256, 1.5, NaN, Infinity])('拒绝非法字节 %s', byte => {
    expect(() => calculateCrc16([byte])).toThrow(RangeError);

    expect(() => verifyCrc16([byte, 0, 0])).toThrow(RangeError);
  });
  it('拒绝稀疏数组', () => {
    expect(() => calculateCrc16(new Array<number>(1))).toThrow(RangeError);
  });
  it('不修改输入数据', () => {
    const data = Object.freeze([...readRequest]);
    calculateCrc16(data);
    formatCrc16Bytes(calculateCrc16(data));
    expect(data).toEqual(readRequest);
  });
});

describe('完整报文 CRC16 校验', () => {
  it('正确报文返回原有、计算校验值和成功状态', () => {
    expect(verifyCrc16(validFrame)).toEqual({ valid: true, receivedCrc: 0x0bc4, calculatedCrc: 0x0bc4 });
    expect(verifyCrc16(new Uint8Array(validFrame)).valid).toBe(true);
  });
  it('错误校验码仍返回诊断值', () => {
    expect(verifyCrc16([...readRequest, 0xc5, 0x0b])).toEqual({ valid: false, receivedCrc: 0x0bc5, calculatedCrc: 0x0bc4 });
  });
  it('交换高低字节不能通过校验', () => {
    expect(verifyCrc16([...readRequest, 0x0b, 0xc4]).valid).toBe(false);
  });
  it('按所选字节顺序提取 CRC，顺序不匹配时失败', () => {
    expect(verifyCrc16(validFrame, 'low-first')).toEqual({ valid: true, receivedCrc: 0x0bc4, calculatedCrc: 0x0bc4 });
    expect(verifyCrc16(validFrame, 'high-first')).toEqual({ valid: false, receivedCrc: 0xc40b, calculatedCrc: 0x0bc4 });
    const highFirstFrame = new Uint8Array([...readRequest, 0x0b, 0xc4]);
    expect(verifyCrc16(highFirstFrame, 'high-first')).toEqual({ valid: true, receivedCrc: 0x0bc4, calculatedCrc: 0x0bc4 });
    expect(verifyCrc16(highFirstFrame, 'low-first')).toEqual({ valid: false, receivedCrc: 0xc40b, calculatedCrc: 0x0bc4 });
  });
  it('高字节在前时仍拒绝错误校验值和被篡改的数据', () => {
    expect(verifyCrc16([...readRequest, 0x0b, 0xc5], 'high-first').valid).toBe(false);
    expect(verifyCrc16([0x02, ...readRequest.slice(1), 0x0b, 0xc4], 'high-first').valid).toBe(false);
  });
  it('数据被篡改不能通过校验', () => {
    expect(verifyCrc16([0x02, ...validFrame.slice(1)]).valid).toBe(false);
  });
  it.each([{ frame: [] }, { frame: [0xc4] }])('缺少完整 CRC 字段时明确报错：$frame', ({ frame }) => {
    expect(() => verifyCrc16(frame)).toThrow('至少需要包含两个 CRC16 字节');
  });
  it('只有 CRC 的输入按空数据校验，不代表 RTU 结构有效', () => {
    expect(verifyCrc16([0xff, 0xff])).toEqual({ valid: true, receivedCrc: 0xffff, calculatedCrc: 0xffff });
    expect(verifyCrc16([0, 0]).valid).toBe(false);
  });
  it('校验不修改原始报文', () => {
    const frame = Object.freeze([...validFrame]);
    verifyCrc16(frame);
    expect(frame).toEqual(validFrame);
  });
});
