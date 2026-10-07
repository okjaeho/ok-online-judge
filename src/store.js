export function readLocal(key, fallback = null) { try { return JSON.parse(localStorage.getItem('ok-oj:' + key)) ?? fallback; } catch { return fallback; } }
export function writeLocal(key, value) { localStorage.setItem('ok-oj:' + key, JSON.stringify(value)); }
let database;
export async function db() {
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open('ok-online-judge', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('books');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return database;
}
export async function book(key, value) {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('books', value === undefined ? 'readonly' : 'readwrite');
    const store = transaction.objectStore('books');
    const request = value === undefined ? store.get(key) : value === null ? store.delete(key) : store.put(value, key);
    let result; request.onsuccess = () => { result = request.result; };
    transaction.oncomplete = () => resolve(result); transaction.onerror = () => reject(transaction.error); transaction.onabort = () => reject(transaction.error || Error('교재 저장이 취소됐습니다.'));
  });
}
