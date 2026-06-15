// Safari compatibility polyfills for PDF.js 5.7.x
// This module must be imported BEFORE pdfjs-dist so that PDF.js module
// initialization finds all methods already available.

// 1. Map.prototype.getOrInsertComputed / getOrInsert (TC39 "Upsert" proposal)
//    Chrome 134+, Firefox 135+, Safari: NOT supported (as of 18.x)
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
  window.__mapUpsertPolyfilled = true;
  Map.prototype.getOrInsertComputed = function(key, callbackFn) {
    if (this.has(key)) return this.get(key);
    var value = callbackFn(key);
    this.set(key, value);
    return value;
  };
}
if (typeof Map.prototype.getOrInsert !== 'function') {
  window.__mapUpsertPolyfilled = true;
  Map.prototype.getOrInsert = function(key, defaultValue) {
    if (this.has(key)) return this.get(key);
    this.set(key, defaultValue);
    return defaultValue;
  };
}
if (!window.__mapUpsertPolyfilled) window.__mapUpsertPolyfilled = false;

// 2. ReadableStream async iteration (Symbol.asyncIterator)
//    PDF.js getTextContent() does `for await (const value of readableStream)`
//    which requires ReadableStream.prototype[Symbol.asyncIterator].
//    Chrome 124+, Firefox 110+, Safari 17.6+ (NOT in Safari 17.0–17.5)
if (typeof ReadableStream !== 'undefined' &&
    typeof ReadableStream.prototype[Symbol.asyncIterator] !== 'function') {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}
