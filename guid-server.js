var logger = require('./lib/logger').logger;
var utils = require('./lib/utils');
var configs = require('./etc/settings.json');
var _logger = logger(__dirname + '/' + configs.log.file);

var fs = require('fs');
var redis = require("redis");
var redisClient = redis.createClient(configs.redis.port, configs.redis.host);
redisClient.select(configs.redis.db);
redisClient.on('ready', function() {
  redisClient.select(configs.redis.db);
});

var redisClient2 = redis.createClient(configs.redis.port, configs.redis.host);
redisClient2.select(2);
redisClient2.on('ready', function() {
  redisClient2.select(2);
});

var express = require('express');

var app = express.createServer();
app.use(express.static(__dirname + '/public'));

fs.writeFileSync(__dirname + '/run/server.lock', process.pid.toString(), 'ascii');

var genGUID = function(options) {
  var guid = utils.md5(utils.getTimestamp().toString());
  guid = guid + utils.genCheckSum(guid);
  return guid;
};
var genSerial = function(gw) {
  var seq = 0;
  return function() {
    seq = ++seq % 0xffff;
    return (gw + new Date().getTime().toString(36) + (seq | 0x10000).toString(16).substr(1)).toUpperCase();
  };
};
var getSerial = genSerial('TEST');

var getJsonMsg = function(result, reason, message) {
  ret = {
    'result' : result,
    'reason' : reason,
    'message' : message
  };
  return JSON.stringify(ret);
};

var getIDCode = function(guid, cb) {
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      redisClient.incr('MSISDN_SEQ', function(err, replies) {
        redisClient.set(guid, replies);
        cb(replies);
      });
    } else {
      cb(replies);
    }
  });
};

app.post('/getGUID', function(req, res) {
  var body = '';
  req.on('data', function(chunk) {
    body += chunk;
  });
  req.on('end', function() {
    console.log(body);
    var guid = genGUID(null);
    res.end(guid);
    getIDCode(guid, function(idcode) {
      redisClient.set(idcode, guid);
    });
  });
});

app.get('/getIDCodeByGUID', function(req, res) {
  var guid = req.query.guid;
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      res.end('error');
    } else {
      res.end(replies);
    }
  });
});
app.get('/getIDCodeByMSISDN', function(req, res) {
});
app.get('/GetMSISDNByIDCode', function(req, res) {
  var idcode = req.query.idcode;
  redisClient2.get(idcode, function(err, replies) {
    if (null === replies) {
      res.end('error');
    } else {
      res.end(replies);
    }
  });
});
app.get('/GetMSISDNByGUID', function(req, res) {
  var guid = req.query.guid;
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      res.end('error');
    } else {
      redisClient2.get(replies, function(err, r) {
        if (null === r) {
          res.end('error');
        } else {
          res.end(r);
        }
      });
    }
  });
});

app.get('/MoBind', function(req, res) {
  var guid = req.query.guid;
  var msisdn = req.query.msisdn;
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      res.end('error');
    } else {
      redisClient2.set(replies, msisdn);
      res.send('ok');
    }
  });
});

app.get('/Test', function(req, res) {
  var guid = req.query.guid;
  res.end(utils.getGUIDFromXGUID(guid));
});
app.listen(configs.service_port);
console.log('Service Started ' + utils.getLocaleISOString());