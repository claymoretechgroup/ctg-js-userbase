import { createHmac } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

interface TotpOptions {
    time?: number;
    step?: number;
    digits?: number;
}

const base32ToBuffer = (secret: string): Buffer => {
    const clean = String(secret).toUpperCase().replace(/[\s=]/g, "");
    let bits = "";

    for (const char of clean) {
        const value = ALPHABET.indexOf(char);
        if (value === -1) {
            throw new Error(`Invalid base32 character: ${char}`);
        }
        bits += value.toString(2).padStart(5, "0");
    }

    const bytes: number[] = [];
    for (let offset = 0; offset + 8 <= bits.length; offset += 8) {
        bytes.push(Number.parseInt(bits.slice(offset, offset + 8), 2));
    }
    return Buffer.from(bytes);
};

const counterBuffer = (counter: number): Buffer => {
    const buffer = Buffer.alloc(8);
    let value = BigInt(counter);
    for (let offset = 7; offset >= 0; offset -= 1) {
        buffer[offset] = Number(value & 0xffn);
        value >>= 8n;
    }
    return buffer;
};

export const totp = (secret: string, options: TotpOptions = {}): string => {
    const time = options.time ?? Date.now();
    const step = options.step ?? 30;
    const digits = options.digits ?? 6;
    const counter = Math.floor(Math.floor(time / 1000) / step);
    const digest = createHmac("sha1", base32ToBuffer(secret))
        .update(counterBuffer(counter))
        .digest();
    const last = digest[digest.length - 1];
    if (last === undefined) {
        throw new Error("TOTP digest was empty");
    }

    const offset = last & 0x0f;
    const part0 = digest[offset];
    const part1 = digest[offset + 1];
    const part2 = digest[offset + 2];
    const part3 = digest[offset + 3];
    if (part0 === undefined || part1 === undefined || part2 === undefined || part3 === undefined) {
        throw new Error("TOTP digest was too short");
    }

    const binary = (
        ((part0 & 0x7f) << 24) |
        ((part1 & 0xff) << 16) |
        ((part2 & 0xff) << 8) |
        (part3 & 0xff)
    );
    const code = binary % (10 ** digits);
    return String(code).padStart(digits, "0");
};

export default totp;
