import { describe, expect, it } from 'vitest';
import { calculateLrc, verifyLrc, formatLrcAsciiFrame } from '../src/core/checksum/lrc';
import { parseHexBytes } from '../src/core/hex';

// 三菱 MODBUS 接口模块手册，表 4.6 和 4.7：02 01 00 00 00 08 → F5。
// https://dl.mitsubishielectric.com/dl/fa/document/manual/plc/sh080578eng/sh080578engk.pdf#page=68
const standardRequest = [0x02, 0x01, 0x00, 0x00, 0x00, 0x08];
const standardFrame = [...standardRequest, 0xf5];

describe('Modbus LRC 计算', () => {
  it('标准手册向量返回 F5，支持数组和 Uint8Array 视图', () => {
    expect(calculateLrc(standardRequest)).toBe(0xf5);
    const buffer = new Uint8Array([0xff, ...standardRequest, 0xff]);
    expect(calculateLrc(buffer.subarray(1, -1))).toBe(0xf5);
  });
  it('按 HEX 数据字节计算，默认示例返回 FA', () => {
    expect(calculateLrc(parseHexBytes('01 03 00 00 00 02'))).toBe(0xfa);
    expect(verifyLrc(parseHexBytes('010300000002FA')).valid).toBe(true);
    expect(() => parseHexBytes(':010300000002FA\r\n')).toThrow();
  });
  it.each([
    { data: [], expected: 0 },
    { data: [0], expected: 0 },
    { data: [1], expected: 0xff },
    { data: [0xff], expected: 1 },
    { data: [0xff, 1], expected: 0 },
    { data: [0xff, 0xff], expected: 2 },
  ])('空数据、前导零和进位边界：$data', ({ data, expected }) => {
    expect(calculateLrc(data)).toBe(expected);
  });
  it('长输入只保留低 8 位', () => {
    expect(calculateLrc(new Uint8Array(100_000).fill(0xff))).toBe(0xa0);
  });
  it.each([-1, 256, 1.5, NaN, Infinity])('拒绝非法字节 %s，包括尾部 LRC', byte => {
    expect(() => calculateLrc([byte])).toThrow(RangeError);
    expect(() => verifyLrc([byte, 0])).toThrow(RangeError);
    expect(() => verifyLrc([0, byte])).toThrow(RangeError);
  });
  it('拒绝稀疏数组', () => {
    expect(() => calculateLrc(new Array<number>(1))).toThrow(RangeError);
    expect(() => verifyLrc(new Array<number>(1))).toThrow(RangeError);
  });
});

describe('LRC ASCII 完整报文格式', () => {
  it('手册图 4.5 向量包含冒号、连续大写 HEX 和实际 CRLF', () => {
    expect(formatLrcAsciiFrame(standardFrame)).toBe(':020100000008F5\r\n');
    expect(formatLrcAsciiFrame(new Uint8Array(standardFrame))).toBe(':020100000008F5\r\n');
  });
  it('默认示例无空格，结束符为实际的 0D 0A 字符', () => {
    const text = formatLrcAsciiFrame([1, 3, 0, 0, 0, 2, 0xfa]);
    expect(text).toBe(':010300000002FA\r\n');
    expect(text).not.toContain(' ');
    expect(text.charCodeAt(text.length - 2)).toBe(0x0d);
    expect(text.charCodeAt(text.length - 1)).toBe(0x0a);
  });
  it('保留零字节和前导零，不修改或重新计算输入', () => {
    const frame = Object.freeze([0, 1, 0xff, 0x0a]);
    expect(formatLrcAsciiFrame(frame)).toBe(':0001FF0A\r\n');
    expect(frame).toEqual([0, 1, 0xff, 0x0a]);
    expect(formatLrcAsciiFrame([0])).toBe(':00\r\n');
  });
  it('拒绝空报文和非法字节', () => {
    expect(() => formatLrcAsciiFrame([])).toThrow('至少需要包含一个 LRC 字节');
    for (const byte of [-1, 256, 1.5, NaN, Infinity]) {
      expect(() => formatLrcAsciiFrame([byte])).toThrow(RangeError);
    }
    expect(() => formatLrcAsciiFrame(new Array<number>(1))).toThrow(RangeError);
  });
});

describe('完整报文 LRC 校验', () => {
  it('标准报文返回成功及诊断值', () => {
    expect(verifyLrc(standardFrame)).toEqual({ valid: true, receivedLrc: 0xf5, calculatedLrc: 0xf5 });
    expect(verifyLrc(new Uint8Array(standardFrame)).valid).toBe(true);
  });
  it('错误校验值及数据篡改返回失败', () => {
    expect(verifyLrc([...standardRequest, 0xf4])).toEqual({ valid: false, receivedLrc: 0xf4, calculatedLrc: 0xf5 });
    expect(verifyLrc([0x03, ...standardFrame.slice(1)]).valid).toBe(false);
  });
  it('缺少 LRC 字段时明确报错', () => {
    expect(() => verifyLrc([])).toThrow('至少需要包含一个 LRC 字节');
    expect(() => verifyLrc(new Uint8Array())).toThrow(RangeError);
  });
  it('只有 LRC 的输入按空数据校验，不代表 ASCII 结构有效', () => {
    expect(verifyLrc([0])).toEqual({ valid: true, receivedLrc: 0, calculatedLrc: 0 });
    expect(verifyLrc([1]).valid).toBe(false);
  });
  it('计算和校验不修改输入', () => {
    const frame = Object.freeze([...standardFrame]);
    calculateLrc(frame);
    verifyLrc(frame);
    expect(frame).toEqual(standardFrame);
  });
});
