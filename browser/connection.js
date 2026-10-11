// Accept older raw tokens as well as the IDE's single-paste connection data.
export function parsePairing(value, fallbackPort) {
  const text = value.trim();
  let token = text, port = Number(fallbackPort);
  if (text.startsWith('{')) {
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('配对信息格式不完整，请从 IDE 重新复制'); }
    if (data?.dsu !== 1 || typeof data.token !== 'string') throw new Error('不是 DSU IDE 配对信息');
    token = data.token.trim(); port = data.port;
  }
  if (!token) throw new Error('请粘贴 IDE 的配对信息');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('端口需为 1024–65535 的整数');
  return { token, port };
}
