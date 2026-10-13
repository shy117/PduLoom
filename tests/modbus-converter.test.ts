import { describe, expect, it } from 'vitest';
import { convertModbusFrame, type ModbusFormat } from '../src/core/modbus/converter';
const frames: Record<ModbusFormat, string> = { rtu: '01 03 00 00 00 02 C4 0B', ascii: ':010300000002FA\r\n', tcp: '00 01 00 00 00 06 01 03 00 00 00 02' };
// 独立请求字节与 CRC 固定向量、LRC 补码和 MBAP 固定头，不通过组帧接口生成预期。
describe('Modbus 格式转换', () => {
  for (const source of ['rtu','ascii','tcp'] as const) {
    for (const target of ['rtu','ascii','tcp'] as const) {
      it(`${source} → ${target} 固定完整帧`, () => {
        const result = convertModbusFrame({ source, target, text: frames[source], transactionId: target === 'tcp' ? 1 : undefined });
        expect(result.text).toBe(frames[target]);
        expect(result.pdu).toEqual([3,0,0,0,2]);
      });
    }
  }
  it('TCP 目标事务号必须明确；TCP 同格式可沿用事务号', () => {
    expect(() => convertModbusFrame({ source: 'rtu', target: 'tcp', text: frames.rtu })).toThrow(/事务标识/);
    expect(convertModbusFrame({ source: 'tcp', target: 'tcp', text: frames.tcp }).transactionId).toBe(1);
    for (const transactionId of [-1,65536,1.5,NaN]) { expect(() => convertModbusFrame({ source: 'rtu', target: 'tcp', text: frames.rtu, transactionId })).toThrow(); }
    expect(convertModbusFrame({ source: 'rtu', target: 'tcp', text: frames.rtu, transactionId: 65535 }).bytes.slice(0,2)).toEqual([255,255]);
    expect(convertModbusFrame({ source: 'tcp', target: 'rtu', text: frames.tcp }).warnings.join()).toContain('事务标识');
  });
  it('拒绝 CRC / LRC 错误、非法 MBAP、截断、未知功能与缺失结束符', () => {
    for (const [source,text] of [
      ['rtu','01 03 00 00 00 02 00 00'], ['ascii',':01030000000200\r\n'],
      ['ascii',':010300000002FA'], ['tcp','00 01 00 01 00 06 01 03 00 00 00 02'],
      ['tcp',frames.tcp + ' FF'], ['tcp','00 01 00 00 00 02 01 07'],
      ['tcp','00 01 00 00 00 06 01 03 00 00 00'],
    ] as [ModbusFormat,string][]) {
      expect(() => convertModbusFrame({ source, target: 'rtu', text })).toThrow();
    }
  });
  it('保持读取响应的全部状态位，不推断请求数量', () => {
    const result = convertModbusFrame({ source: 'ascii', target: 'tcp', text: ':010101FFFE\r\n', transactionId: 1 });
    expect(result.text).toBe('00 01 00 00 00 04 01 01 01 FF');
    expect(result.warnings.join()).toContain('填充位');
  });
  it('原始寄存器字节保持不变，包括特殊浮点位模式', () => {
    const result = convertModbusFrame({ source: 'tcp', target: 'ascii', text: '00 01 00 00 00 07 01 03 04 FF C0 00 01' });
    expect(result.text).toBe(':010304FFC0000138\r\n');
  });
  it('TCP 单元标识不能静默截断或改为串行地址', () => {
    const text = frames.tcp.replace('06 01','06 FF');
    expect(() => convertModbusFrame({ source: 'tcp', target: 'rtu', text })).toThrow(/目标/);
    const result = convertModbusFrame({ source: 'tcp', target: 'ascii', text, unitId: 1 });
    expect(result.text).toBe(frames.ascii);
    expect(result.warnings.join()).toContain('255 修改为 1');
    for (const unitId of [-1,248,256,1.5,NaN]) { expect(() => convertModbusFrame({ source: 'tcp', target: 'ascii', text, unitId })).toThrow(); }
  });
  it('目标地址为 0 时直接转换合法写帧，拒绝明确的响应及读请求', () => {
    const text = '00 01 00 00 00 06 00 06 00 01 00 03';
    expect(convertModbusFrame({ source: 'tcp', target: 'ascii', text }).text).toBe(':000600010003F6\r\n');
    expect(convertModbusFrame({ source: 'tcp', target: 'ascii', text: '00 01 00 00 00 06 01 06 00 01 00 03', unitId: 0 }).text).toBe(':000600010003F6\r\n');
    expect(() => convertModbusFrame({ source: 'tcp', target: 'ascii', text: '00 01 00 00 00 06 01 10 00 01 00 02', unitId: 0 })).toThrow(/广播/);
    expect(() => convertModbusFrame({ source: 'tcp', target: 'ascii', text: frames.tcp, unitId: 0 })).toThrow(/广播/);
  });
  it('异常响应与请求响应歧义不改变业务字节', () => {
    expect(convertModbusFrame({ source: 'ascii', target: 'tcp', text: ':0183027A\r\n', transactionId: 1 }).text).toBe('00 01 00 00 00 03 01 83 02');
    const result = convertModbusFrame({ source: 'ascii', target: 'tcp', text: ':010600010003F5\r\n', transactionId: 1 });
    expect(result.warnings.join()).toContain('方向');
    expect(result.pdu).toEqual([6,0,1,0,3]);
  });
});
