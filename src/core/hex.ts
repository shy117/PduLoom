/** 接受连续 HEX 或以空白分隔的完整字节组，不接受 0x 前缀。 */
export function parseHexBytes(input: string): number[] {
  const text = input.trim();
  if (!text) { throw new Error('请输入十六进制数据'); }
  if (/[^0-9a-f\s]/i.test(text)) { throw new Error('包含非法十六进制字符，仅支持 0～9、A～F 和空白分隔'); }
  const parts = text.split(/\s+/);
  if (parts.some(part => part.length % 2 !== 0)) { throw new Error('十六进制字节不完整，每个字节必须包含两位字符'); }
  const hex = parts.join('');
  return Array.from({ length: hex.length / 2 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
}
