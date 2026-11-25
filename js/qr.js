/* StallPOS v2 — offline QR code generator (byte mode, ECC-L, versions 1–5).
   Verified module-for-module against the 'qrcode' reference library. */
SP.qr = (() => {
  const OfflineQR = (function () {
        const GF_EXP = new Uint8Array(512);
        const GF_LOG = new Uint8Array(256);
        let x = 1;
        for (let i = 0; i < 255; i++) {
          GF_EXP[i] = x;
          GF_LOG[x] = i;
          x <<= 1;
          if (x & 0x100) x ^= 0x11d;
        }
        for (let i = 255; i < 512; i++) GF_EXP[i] = GF_EXP[i - 255];
  
        function gfMul(a, b) {
          return (a === 0 || b === 0) ? 0 : GF_EXP[GF_LOG[a] + GF_LOG[b]];
        }
  
        function rsPoly(ecLen) {
          let poly = [1];
          for (let i = 0; i < ecLen; i++) {
            const next = new Array(poly.length + 1).fill(0);
            for (let j = 0; j < poly.length; j++) {
              next[j] ^= poly[j];
              next[j + 1] ^= gfMul(poly[j], GF_EXP[i]);
            }
            poly = next;
          }
          return poly;
        }
  
        function rsEncode(data, ecLen) {
          const gen = rsPoly(ecLen);
          const rem = new Uint8Array(ecLen);
          for (let i = 0; i < data.length; i++) {
            const factor = data[i] ^ rem[0];
            for (let j = 0; j < ecLen - 1; j++) rem[j] = rem[j + 1];
            rem[ecLen - 1] = 0;
            if (factor !== 0) {
              for (let j = 0; j < ecLen; j++) rem[j] ^= gfMul(gen[j + 1], factor);
            }
          }
          return rem;
        }
  
        const VERSIONS = [
          { ver: 1, size: 21, dataBytes: 19,  ecBytes: 7,  align: null },
          { ver: 2, size: 25, dataBytes: 34,  ecBytes: 10, align: 18 },
          { ver: 3, size: 29, dataBytes: 55,  ecBytes: 15, align: 22 },
          { ver: 4, size: 33, dataBytes: 80,  ecBytes: 20, align: 26 },
          { ver: 5, size: 37, dataBytes: 108, ecBytes: 26, align: 30 }
        ];
  
        function encodeBytes(text) {
          const bytes = [];
          for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code < 0x80) bytes.push(code);
            else if (code < 0x800) {
              bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
            } else {
              bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
            }
          }
          return bytes;
        }
  
        function generateMatrix(text) {
          const raw = encodeBytes(text);
          const v = VERSIONS.find(cfg => raw.length + 2 <= cfg.dataBytes);
          if (!v) return null;
  
          const bits = [];
          function pushBits(val, len) {
            for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
          }
          pushBits(0b0100, 4); // Byte mode
          pushBits(raw.length, 8);
          raw.forEach(b => pushBits(b, 8));
  
          const maxBits = v.dataBytes * 8;
          pushBits(0, Math.min(4, maxBits - bits.length));
          while (bits.length % 8 !== 0) bits.push(0);
  
          const data = [];
          for (let i = 0; i < bits.length; i += 8) {
            let byte = 0;
            for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
            data.push(byte);
          }
          let padToggle = true;
          while (data.length < v.dataBytes) {
            data.push(padToggle ? 0xec : 0x11);
            padToggle = !padToggle;
          }
  
          const ecc = rsEncode(data, v.ecBytes);
          const codewords = [...data, ...ecc];
          const size = v.size;
          const mat = Array.from({ length: size }, () => new Int8Array(size)); // 0=empty, 1=dark, -1=light
          const isFunc = Array.from({ length: size }, () => new Uint8Array(size));
  
          function setFunc(r, c, dark) {
            if (r < 0 || c < 0 || r >= size || c >= size) return;
            mat[r][c] = dark ? 1 : -1;
            isFunc[r][c] = 1;
          }
  
          function drawFinder(r0, c0) {
            for (let r = -1; r <= 7; r++) {
              for (let c = -1; c <= 7; c++) {
                const inBox = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                const dark = inBox && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
                setFunc(r0 + r, c0 + c, dark);
              }
            }
          }
  
          drawFinder(0, 0);
          drawFinder(0, size - 7);
          drawFinder(size - 7, 0);
  
          for (let i = 8; i < size - 8; i++) {
            setFunc(6, i, i % 2 === 0);
            setFunc(i, 6, i % 2 === 0);
          }
  
          if (v.align !== null) {
            const a = v.align;
            for (let r = -2; r <= 2; r++) {
              for (let c = -2; c <= 2; c++) {
                setFunc(a + r, a + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
              }
            }
          }
  
          // Reserve format info areas
          for (let i = 0; i < 9; i++) {
            if (!isFunc[8][i]) setFunc(8, i, false);
            if (!isFunc[i][8]) setFunc(i, 8, false);
          }
          for (let i = size - 8; i < size; i++) {
            setFunc(8, i, false);
            setFunc(i, 8, false);
          }
          setFunc(4 * v.ver + 9, 8, true); // Dark module
  
          // Place data bits with Mask 0: (r + c) % 2 === 0
          let bitIdx = 0;
          const totalBits = codewords.length * 8;
          let upward = true;
          for (let col = size - 1; col >= 1; col -= 2) {
            if (col === 6) col--;
            for (let step = 0; step < size; step++) {
              const row = upward ? (size - 1 - step) : step;
              for (let dx = 0; dx < 2; dx++) {
                const c = col - dx;
                if (isFunc[row][c]) continue;
                let bit = 0;
                if (bitIdx < totalBits) {
                  bit = (codewords[bitIdx >> 3] >> (7 - (bitIdx & 7))) & 1;
                  bitIdx++;
                }
                if ((row + c) % 2 === 0) bit ^= 1;
                mat[row][c] = bit ? 1 : -1;
              }
            }
            upward = !upward;
          }
  
          // Compute format bits for ECC-L (01) + Mask 0 (000)
          const data5 = (0b01 << 3) | 0b000;
          let rem = data5 << 10;
          for (let i = 14; i >= 10; i--) {
            if ((rem >> i) & 1) rem ^= 0x537 << (i - 10);
          }
          const fmt = ((data5 << 10) | rem) ^ 0x5412;
  
          for (let i = 0; i <= 5; i++) setFunc(8, i, (fmt >> (14 - i)) & 1);
          setFunc(8, 7, (fmt >> 8) & 1);
          setFunc(8, 8, (fmt >> 7) & 1);
          setFunc(7, 8, (fmt >> 6) & 1);
          for (let i = 0; i <= 5; i++) setFunc(5 - i, 8, (fmt >> (5 - i)) & 1);
  
          for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, (fmt >> i) & 1);
          for (let i = 0; i < 7; i++) setFunc(size - 7 + i, 8, (fmt >> (8 + i)) & 1);
  
          return mat;
        }
  
        function toSvg(text, px = 180) {
          const mat = generateMatrix(text);
          if (!mat) {
            return `<div style="width:${px}px;height:${px}px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#64748b;text-align:center;padding:8px;">Link too long for offline QR. Upload a custom QR image in Admin Settings.</div>`;
          }
          const size = mat.length;
          const quiet = 3;
          const full = size + quiet * 2;
          let rects = '';
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (mat[r][c] === 1) {
                rects += `<rect x="${c + quiet}" y="${r + quiet}" width="1" height="1" fill="#0f172a"/>`;
              }
            }
          }
          return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" width="${px}" height="${px}" style="display:block;background:#fff;shape-rendering:crispEdges;">${rects}</svg>`;
        }
  
        return { toSvg };
      })();
  return OfflineQR;
})();
