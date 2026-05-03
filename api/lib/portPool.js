'use strict';

const POOL = new Set(Array.from({ length: 100 }, (_, i) => 9000 + i));

function acquire() {
  const [port] = POOL;
  if (port === undefined) throw new Error('port pool exhausted');
  POOL.delete(port);
  return port;
}

function release(port) {
  POOL.add(port);
}

module.exports = { acquire, release };
