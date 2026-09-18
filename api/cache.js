// ============================================================
// 단순 인메모리 캐시
// Vercel 서버리스는 인스턴스가 재활용되므로 워밍 상태에서는 유효
// 장기 캐시가 필요하면 Upstash Redis 등으로 교체 가능
// ============================================================

const store = new Map();

async function cacheGet(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expireAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

async function cacheSet(key, value, ttlSeconds) {
  store.set(key, {
    value,
    expireAt: Date.now() + ttlSeconds * 1000
  });
}

module.exports = { cacheGet, cacheSet };