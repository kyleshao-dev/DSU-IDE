import { zlibSync } from 'fflate';
import { writeFile } from 'node:fs/promises';
// Code-native bracket mark: no fonts or external image services required.
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
  const sum = Buffer.alloc(4); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, body, sum]);
}
export async function browserIcons(output) {
  for (const size of [16, 32, 48, 128]) {
    const pixels = Buffer.alloc(size * (size * 4 + 1));
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const stroke = (u >= .21 && u < .29 && v >= .23 && v < .77) || (u >= .71 && u < .79 && v >= .23 && v < .77) || ((u >= .21 && u < .42 || u >= .58 && u < .79) && (v >= .23 && v < .31 || v >= .69 && v < .77)) || (u >= .46 && u < .54 && v >= .44 && v < .56);
      pixels.set(stroke ? [159, 227, 185, 255] : [17, 25, 22, 255], y * (size * 4 + 1) + 1 + x * 4);
    }
    const header = Buffer.alloc(13); header.writeUInt32BE(size); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
    await writeFile(`${output}/icon${size}.png`, Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', Buffer.from(zlibSync(pixels))), chunk('IEND', Buffer.alloc(0))]));
  }
}
