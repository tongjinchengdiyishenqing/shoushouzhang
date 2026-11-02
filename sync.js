/* 随手账云同步加密模块（端到端，纯 Web Crypto API，零依赖）
 *
 * 模型：
 *   - 加密密钥由「用户名 + 登录密码」在前端派生，后端永远只见密文，
 *     所以即使数据库被拖走，没有密码也解不开账本
 *   - deriveKeyFromPassword: PBKDF2(密码, salt="sz-sync-v1:"+用户名, 200000 轮, SHA-256) → AES-GCM 256
 *   - 派生结果导出成 raw 存本地，自动同步时直接复用，不用每次输密码
 *   - encrypt: 随机 12 字节 IV，AES-GCM，输出 base64(iv || ciphertext)
 *   - decrypt: 解不开必须抛错（密码不对或数据损坏），禁止静默返回空对象
 *
 * 用法：
 *   const key = await SZSync.deriveKeyFromPassword("mypwd", "alice");
 *   const cipher = await SZSync.encrypt(key, { entries: [...] });
 *   const obj = await SZSync.decrypt(key, cipher);
 */
(function () {
  "use strict";

  var PBKDF2_SALT_PREFIX = "sz-sync-v1:";
  var PBKDF2_ITERATIONS = 200000;
  var IV_LEN = 12; // AES-GCM 推荐 96 位

  var enc = new TextEncoder();
  var dec = new TextDecoder();

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

  /* 用户名 + 密码 → AES-GCM 256。同一账号在任何设备派生出同一把钥匙 */
  async function deriveKeyFromPassword(password, username) {
    if (!password || typeof password !== "string") {
      throw new Error("密码不能为空");
    }
    if (!username || typeof username !== "string") {
      throw new Error("用户名不能为空");
    }
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
        salt: enc.encode(PBKDF2_SALT_PREFIX + username.trim().toLowerCase()),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      material,
      { name: "AES-GCM", length: 256 },
      true, // 允许导出，便于登录后缓存到本地
      ["encrypt", "decrypt"]
    );
  }

  /* 导出成 base64，登录成功后存起来，自动同步时不用再输密码 */
  async function exportKeyRaw(key) {
    var raw = await crypto.subtle.exportKey("raw", key);
    return bytesToB64(new Uint8Array(raw));
  }

  async function importKeyRaw(b64) {
    var raw = b64ToBytes(b64);
    if (raw.length !== 32) {
      throw new Error("本地密钥已损坏，请重新登录");
    }
    return crypto.subtle.importKey("raw", raw, "AES-GCM", true, ["encrypt", "decrypt"]);
  }

  async function encrypt(key, obj) {
    var iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
    var plain = enc.encode(JSON.stringify(obj));
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
      throw new Error("解密失败：密码不对或数据损坏（非法 base64）");
    }
    if (data.length < IV_LEN + 17) {
      // 12 字节 IV + 16 字节 GCM tag + 至少 1 字节明文
      throw new Error("解密失败：密码不对或数据损坏（长度不足）");
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
      throw new Error("解密失败：密码不对或数据损坏");
    }
    try {
      return JSON.parse(dec.decode(plain));
    } catch (e) {
      throw new Error("解密失败：密码不对或数据损坏（明文不是 JSON）");
    }
  }

  window.SZSync = {
    deriveKeyFromPassword: deriveKeyFromPassword,
    exportKeyRaw: exportKeyRaw,
    importKeyRaw: importKeyRaw,
    encrypt: encrypt,
    decrypt: decrypt,
  };
})();
