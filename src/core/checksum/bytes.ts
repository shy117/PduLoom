export type ByteInput = readonly number[] | Uint8Array;

export function assertBytes(data: ByteInput): void {
  for (let index = 0; index < data.length; index++) {
    const byte = data[index];
    if (byte === undefined || !Number.isInteger(byte) || byte < 0 || byte > 0xff) {
      throw new RangeError(`第 ${index} 个字节必须是 0～255 的整数`);
    }
  }
}
