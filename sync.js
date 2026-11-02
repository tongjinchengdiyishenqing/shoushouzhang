/* 随手账云同步加密模块（端到端，纯 Web Crypto API，零依赖）
 *
 * 模型：
 *   - 同步码同时是「接管凭证」和「加密密钥的人类可读编码」，后端永远只见密文
 *   - deriveKey: PBKDF2(同步码去分隔符大写, salt="sz-sync-v1", 200000 次, SHA-256) → AES-GCM 256
 *   - encrypt:   随机 12 字节 IV，AES-GCM，输出 base64(iv || ciphertext)
 *   - decrypt:   解不开必须抛错（同步码不对或数据损坏），禁止静默返回空对象
 *
 * 用法：
 *   const key = await SZSync.deriveKey("ABCD-EFGH-JKLM");
 *   const cipher = await SZSync.encrypt(key, { ledger: [...] });
 *   const obj = await SZSync.decrypt(key, cipher);
 */
(function () {
  "use strict";

  var PBKDF2_SALT = "sz-sync-v1";
  var PBKDF2_ITERATIONS = 200000;
  var IV_LEN = 12; // AES-GCM 推荐 96 位
  var CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{12}$/; // 不含 O0I1

  /* "abcd efgh-jklm" / "ABCDEFGHJKLM" → "ABCD-EFGH-JKLM" */
  function normalizeCode(input) {
    if (typeof input !== "string") {
      throw new Error("同步码必须是字符串");
    }
    var clean = input.replace(/[\s\-_]/g, "").toUpperCase();
    if (!CODE_RE.test(clean)) {
      throw new Error("同步码格式不对：应为 12 位字母数字（不含 O/0/I/1）");
    }
    return clean.slice(0, 4) + "-" + clean.slice(4, 8) + "-" + clean.slice(8, 12);
  }

  async function deriveKey(syncCode) {
    var password = normalizeCode(syncCode).replace(/-/g, "");
    var enc = new TextEncoder();
    var material = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: enc.encode(PBKDF2_SALT),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  function bytesToB64(bytes) {
    var bin = "";
    var CHUNK = 0x8000; // 分块避免 apply 参数上限
    for (var i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function encrypt(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    var plain = new TextEncoder().encode(JSON.stringify(obj));
    var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain);
    var out = new Uint8Array(IV_LEN + cipher.byteLength);
    out.set(iv, 0);
    out.set(new Uint8Array(cipher), IV_LEN);
    return bytesToB64(out);
  }

  async function decrypt(key, b64) {
    var data;
    try {
      data = b64ToBytes(b64);
    } catch (e) {
      throw new Error("解密失败：同步码不对或数据损坏（非法 base64）");
    }
    if (data.length < IV_LEN + 17) {
      // 12 字节 IV + 16 字节 GCM tag + 至少 1 字节明文
      throw new Error("解密失败：同步码不对或数据损坏（长度不足）");
    }
    var plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: data.slice(0, IV_LEN) },
        key,
        data.slice(IV_LEN)
      );
    } catch (e) {
      // GCM 认证失败：密钥错或密文被改，绝不返回部分明文
      throw new Error("解密失败：同步码不对或数据损坏");
    }
    try {
      return JSON.parse(new TextDecoder().decode(plain));
    } catch (e) {
      throw new Error("解密失败：同步码不对或数据损坏（明文不是 JSON）");
    }
  }

  window.SZSync = {
    deriveKey: deriveKey,
    encrypt: encrypt,
    decrypt: decrypt,
    normalizeCode: normalizeCode,
  };
})();
