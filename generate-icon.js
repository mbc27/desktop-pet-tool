// generate-icon.js - 生成宠物图标 PNG
// 不使用任何外部依赖，纯 Node + zlib 生成 PNG

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function makePNG(width, height, pixelData) {
    // pixelData: Buffer with RGBA pixels (width*height*4 bytes)
    function crc32(buf) {
        let c = ~0;
        for (let i = 0; i < buf.length; i++) {
            c ^= buf[i];
            for (let j = 0; j < 8; j++) {
                c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
            }
        }
        return (~c) >>> 0;
    }

    function chunk(type, data) {
        const t = Buffer.from(type, 'ascii');
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length, 0);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
        return Buffer.concat([len, t, data, crc]);
    }

    const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;   // bit depth
    ihdr[9] = 6;   // color type RGBA
    ihdr[10] = 0;
    ihdr[11] = 0;
    ihdr[12] = 0;

    // 每行前加 filter byte (0)
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0;
        for (let x = 0; x < width; x++) {
            const src = (y * width + x) * 4;
            const dst = y * (width * 4 + 1) + 1 + x * 4;
            raw[dst] = pixelData[src];
            raw[dst + 1] = pixelData[src + 1];
            raw[dst + 2] = pixelData[src + 2];
            raw[dst + 3] = pixelData[src + 3];
        }
    }

    const idat = zlib.deflateSync(raw, { level: 9 });
    const iend = Buffer.alloc(0);

    return Buffer.concat([
        signature,
        chunk('IHDR', ihdr),
        chunk('IDAT', idat),
        chunk('IEND', iend)
    ]);
}

function drawIcon(size) {
    const pixels = Buffer.alloc(size * size * 4);
    const cx = size / 2;
    const cy = size / 2;

    function setPixel(x, y, r, g, b, a) {
        if (x < 0 || x >= size || y < 0 || y >= size) return;
        const i = (y * size + x) * 4;
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = a;
    }

    function fillCircle(cx, cy, r, r0, g0, b0, a0) {
        for (let y = -r; y <= r; y++) {
            for (let x = -r; x <= r; x++) {
                if (x * x + y * y <= r * r) {
                    setPixel(cx + x, cy + y, r0, g0, b0, a0);
                }
            }
        }
    }

    // 透明背景
    for (let i = 3; i < pixels.length; i += 4) pixels[i] = 0;

    // 圆形主背景（紫色渐变）
    const r = size / 2 - 1;
    fillCircle(cx, cy, r, 80, 60, 160, 255);
    fillCircle(cx, cy, r - 2, 120, 90, 220, 255);

    // 简易猫爪图案：1 个掌心 + 4 个脚趾
    const pad = size * 0.18;
    const toeR = size * 0.10;
    fillCircle(cx, cy + size * 0.05, pad, 240, 230, 255, 255);

    fillCircle(cx - size * 0.22, cy - size * 0.18, toeR, 240, 230, 255, 255);
    fillCircle(cx, cy - size * 0.28, toeR, 240, 230, 255, 255);
    fillCircle(cx + size * 0.22, cy - size * 0.18, toeR, 240, 230, 255, 255);
    fillCircle(cx + size * 0.32, cy + size * 0.08, toeR, 240, 230, 255, 255);

    // 眼睛 + 嘴巴（小细节）
    fillCircle(cx - size * 0.10, cy - size * 0.05, size * 0.025, 60, 40, 120, 255);
    fillCircle(cx + size * 0.10, cy - size * 0.05, size * 0.025, 60, 40, 120, 255);

    return makePNG(size, size, pixels);
}

// 生成不同尺寸的图标
const assetsDir = path.join(__dirname, 'assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

const icon256 = drawIcon(256);
fs.writeFileSync(path.join(assetsDir, 'icon.png'), icon256);
console.log('生成 assets/icon.png (256x256)');

const trayIcon = drawIcon(16);
fs.writeFileSync(path.join(assetsDir, 'tray-icon.png'), trayIcon);
console.log('生成 assets/tray-icon.png (16x16)');
