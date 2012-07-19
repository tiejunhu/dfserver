var port = 1110;
var folder = './data/';

var log = require('./log');
var net = require('net');
var Long = require('./long');
var fs = require('fs');
var path = require('path');

log.setGlobalLevel(log.INFO);

/*
 * Receive data according to "data" structure's maxSize.
 * 
 * This func will be called every time there is a 'on data' event.
 * 
 * Received data will be copyed from global.chunk to data.buffer according to 
 * data.maxSize. If data is not enough to fill the data.buffer, we'll wait for 
 * next call, or we will marked data.received and call the "callback"
 *
 */
function receive(data, global, callback) {
  // check if this data has received
  if (data.received) {
    log.debug(data.desc + ' already received.');
    return;
  }

  var bytesToCopy = global.chunk.length;
  global.bytesLeft = 0;

  // if chunk is enough to fill the left buffer
  if (global.chunk.length + data.contentSize > data.maxSize) {
    bytesToCopy = data.maxSize - data.contentSize;
    global.bytesLeft = global.chunk.length - bytesToCopy;
  }

  // copy the data into buffer
  log.debug(data.desc + ' buffer, bytes to copy ' + bytesToCopy + ', bytes left ' + global.bytesLeft)
  global.chunk.copy(data.buffer, data.contentSize, 0, bytesToCopy);
  data.contentSize += bytesToCopy;

  // received enough data
  if (data.contentSize == data.maxSize) {
    log.debug(data.desc + ' received.');
    data.received = true;
    callback();
  }

  // still left data after we got ours
  if (global.bytesLeft > 0) {
    global.chunk = global.chunk.slice(global.chunk.length - global.bytesLeft);
  }
}

var server = net.createServer(function(socket) {

  var fileWriteStream = null;
  var fileWriteSize = Long.Long(0, 0);

  var remoteAddress = '<NO REMOTE ADDR>';

  socket.on('connect', function() {
    remoteAddress = socket.remoteAddress + ':' + socket.remotePort;
    console.log(remoteAddress + ' connected.');
    log.debug(remoteAddress + ' connected.');
  });

  var fileName = {
    desc: 'file name',
    received: false,
    maxSize: 260,
    buffer: new Buffer(260),
    contentSize: 0,
    value: "<NO FILE>"
  };

  var fileLength = {
    desc: 'file length',
    received: false,
    maxSize: 8,
    buffer: new Buffer(8),
    contentSize: 0,
    value: Long.Long(0, 0)
  };

  var global = {
    bytesLeft: 0,
    chunk: null
  };

  socket.on('data', function(chunk) {
    console.log("received chunk " + chunk.length + " bytes");
    log.debug("received chunk " + chunk.length + " bytes");

    global.bytesLeft = chunk.length;
    global.chunk = chunk;

    //receive and decode file name
    receive(fileName, global, function() {
      fileName.value = fileName.buffer.toString('ascii').replace(/\000/g, ''); // replace the ending 'zero' char
      log.info(remoteAddress + ' file name received as ' + fileName.value);
      fileWriteStream = fs.createWriteStream(path.join(folder, fileName.value), { flags: 'w+' });
    });

    if (global.bytesLeft == 0) {
      return;
    }

    // receive and decode file length
    receive(fileLength, global, function() {
      var fileLength1 = fileLength.buffer.readUInt32LE(0);
      var fileLength2 = fileLength.buffer.readUInt32LE(4);
      fileLength.value = Long.Long(fileLength1, fileLength2);
      log.info(remoteAddress + ' file length received as ' + fileLength.value.toString());
    });

    if (global.bytesLeft == 0) {
      return;
    }

    // receive file data
    log.debug("received data " + global.chunk.length + " bytes");
    fileWriteSize = fileWriteSize.add(Long.Long(global.chunk.length, 0));
    fileWriteStream.write(global.chunk);
    if (fileWriteSize.equals(fileLength.value)) {
      socket.write("ok");
      log.debug(remoteAddress + ' wrote ok');
    }
  });

  socket.on('close', function() {
    log.debug(remoteAddress + ' ended.');
    if (fileWriteSize.equals(fileLength.value)) {
      log.info(remoteAddress + ' sent a file as ' + fileName.value + ', size of ' + fileWriteSize.toString());
    } else {
      log.error(remoteAddress + ' sent a file as ' + fileName.value + ', size of ' + fileLength.value.toString() + ', but received ' + fileWriteSize.toString());
    }
    if (fileWriteStream) {
      fileWriteStream.end();    
    }
  });

  socket.on('error', function(err) {
    log.error(remoteAddress + ' ' + err);
  })

});

if (!fs.existsSync(folder)) {
  log.error("cannot find data folder " + folder);
  process.exit(1);
}

server.listen(port);

log.info("server running at port " + port);

process.on('uncaughtException', function (err) {
  console.error("!!! uncaught exception !!!")
  console.error(err.stack);
  log.error("!!! uncaught exception !!!");
  log.error(err.stack);
});