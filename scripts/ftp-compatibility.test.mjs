import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';

async function fixture(transferHost) {
  const sockets = new Set();
  const connections = { control: 0, advertised: 0 };
  const commands = [];
  const unexpectedErrors = [];
  let payloadSent = false;
  let closing = false;
  let dataSocket;
  let payload;
  function trackSocket(socket) {
    sockets.add(socket);
    socket.on('error', (error) => {
      // The client may reset its control socket after receiving the completed transfer.
      if (error.code !== 'ECONNRESET' || (!payloadSent && !closing)) {
        unexpectedErrors.push(error);
      }
    });
    socket.on('close', () => sockets.delete(socket));
  }
  function acceptData(host) {
    return (socket) => {
      connections[host]++;
      dataSocket = socket;
      payload = host === 'control' ? 'synthetic-loopback-payload' : 'untrusted-advertised-payload';
      trackSocket(socket);
    };
  }
  const data = createServer(acceptData('control'));
  data.listen(0, '127.0.0.1');
  await once(data, 'listening');
  const port = data.address().port;
  const alternate = transferHost === '127.0.0.1' ? undefined : createServer(acceptData('advertised'));
  if (alternate) {
    alternate.listen(port, transferHost);
    await once(alternate, 'listening');
  }
  const control = createServer((socket) => {
    trackSocket(socket);
    socket.write('220 Synthetic loopback FTP ready\r\n');
    let pending = '';
    socket.on('data', (chunk) => {
      pending += chunk.toString();
      let end;
      while ((end = pending.indexOf('\r\n')) !== -1) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const command = line.split(' ')[0];
        commands.push(command);
        switch (command) {
          case 'USER':
            socket.write('331 Password required\r\n');
            break;
          case 'PASS':
            socket.write('230 Logged in\r\n');
            break;
          case 'FEAT':
            socket.write('211 No extensions\r\n');
            break;
          case 'TYPE':
          case 'STRU':
          case 'OPTS':
            socket.write('200 OK\r\n');
            break;
          case 'MDTM':
            socket.write('213 20260101000000\r\n');
            break;
          case 'EPSV':
            socket.write('500 Use PASV for this compatibility test\r\n');
            break;
          case 'PASV':
            socket.write(
              `227 Entering Passive Mode (${transferHost.replaceAll('.', ',')},${port >> 8},${port & 255})\r\n`
            );
            break;
          case 'RETR':
            socket.write('150 Opening data connection\r\n');
            assert(dataSocket, 'FTP client must establish the data connection before RETR');
            dataSocket.end(payload, () => {
              payloadSent = true;
              socket.write('226 Transfer complete\r\n');
            });
            break;
          case 'QUIT':
            socket.end('221 Goodbye\r\n');
            break;
          default:
            socket.write('502 Unsupported command\r\n');
        }
      }
    });
  });
  control.listen(0, '127.0.0.1');
  await once(control, 'listening');
  return {
    url: `ftp://127.0.0.1:${control.address().port}/fixture.txt`,
    commands,
    connections,
    async close() {
      closing = true;
      const socketClosures = [...sockets].map((socket) => new Promise((resolve) => socket.once('close', resolve)));
      for (const socket of sockets) {
        socket.destroy();
      }
      await Promise.all([
        ...socketClosures,
        new Promise((resolve) => control.close(resolve)),
        new Promise((resolve) => data.close(resolve)),
        ...(alternate ? [new Promise((resolve) => alternate.close(resolve))] : []),
      ]);
      assert.deepEqual(unexpectedErrors, [], 'unexpected FTP fixture socket errors');
    },
  };
}

async function retrieve(url) {
  const child = spawn(
    process.execPath,
    [
      '--unhandled-rejections=strict',
      '--input-type=module',
      '-e',
      `
    import { getUri } from 'get-uri';
    const stream = await getUri(process.argv[1]);
    for await (const chunk of stream) process.stdout.write(chunk);
  `,
      url,
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NODE_TEST_CONTEXT: undefined } }
  );
  let output = '';
  let error = '';
  child.stdout.on('data', (chunk) => {
    output += chunk;
  });
  child.stderr.on('data', (chunk) => {
    error += chunk;
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null, 'FTP compatibility process must finish without timeout');
    return { code, output, error };
  } finally {
    clearTimeout(timer);
  }
}

test('real get-uri retrieves FTP data from the same loopback host', { timeout: 10000 }, async () => {
  const server = await fixture('127.0.0.1');
  try {
    const result = await retrieve(server.url);
    assert.equal(result.code, 0, result.error);
    assert.equal(result.output, 'synthetic-loopback-payload');
    assert.equal(server.connections.control, 1);
    assert(server.commands.includes('RETR'));
  } finally {
    await server.close();
  }
});

test(
  'real get-uri cannot contact an advertised different loopback transfer host by default',
  { timeout: 10000 },
  async () => {
    const server = await fixture('127.0.0.2');
    try {
      const result = await retrieve(server.url);
      assert(server.commands.includes('PASV'), 'must reach passive transfer negotiation');
      assert.equal(result.code, 0, result.error);
      assert.equal(result.output, 'synthetic-loopback-payload', 'only the control-host listener may supply data');
      assert.equal(server.connections.advertised, 0, 'advertised host must receive no connection');
      assert.equal(server.connections.control, 1, 'data transfer must stay pinned to the control host');
    } finally {
      await server.close();
    }
  }
);
