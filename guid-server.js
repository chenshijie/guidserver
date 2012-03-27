var logger = require('./lib/logger').logger;
var utils = require('./lib/utils');
var configs = require('./etc/settings.json');
var _logger = logger(__dirname + '/' + configs.log.file);
var qs = require('querystring');
var fs = require('fs');
console.log(configs.redis.host + ':' + configs.redis.port);
var selfStockProxyService = require('./lib/selfstockproxy');
var redis = require("redis");
/**
 * redisclient对应database 1,该库用户存储guid:idcoe 对应关系
 * @type {[object]}
 */
var redisClient = redis.createClient(configs.redis.port, configs.redis.host);
redisClient.select(configs.redis.db);
redisClient.on('ready', function() {
  redisClient.select(configs.redis.db);
});
/**
 * redisclient对应database 2,该库用户存储guid:idcoe 对应关系
 * @type {[object]}
 */
var redisClient2 = redis.createClient(configs.redis.port, configs.redis.host);
redisClient2.select(2);
redisClient2.on('ready', function() {
  redisClient2.select(2);
});
/**
 * redisclient对应database 2,客户端信息
 * @type {[object]}
 */
var redisClient3 = redis.createClient(configs.redis.port, configs.redis.host);
redisClient3.select(3);
redisClient3.on('ready', function() {
  redisClient3.select(3);
});

var express = require('express');

var app = express.createServer();
app.use(express.static(__dirname + '/public'));

fs.writeFileSync(__dirname + '/run/server.lock', process.pid.toString(), 'ascii');

var genGUID4ByMSISDN = function(msisdn) {
  var guid = utils.md5(msisdn);
  guid = guid + utils.genCheckSum(guid);
  return guid;
};
/**
 * [genSerial description]
 * @param  {[type]} gw [description]
 * @return {[type]}
 */
var genSerial = function(gw) {
  var seq = 0;
  return function() {
    seq = ++seq % 0xffff;
    return (gw + new Date().getTime().toString(36) + (seq | 0x10000).toString(16).substr(1)).toUpperCase();
  };
};
var getSerial = genSerial('TEST');

/**
 * [getJsonMsg description]
 * @param  {[type]} result  [description]
 * @param  {[type]} reason  [description]
 * @param  {[type]} message [description]
 * @return {[type]}
 */
var getJsonMsg = function(result, reason, message) {
  ret = {
    'result': result,
    'reason': reason,
    'message': message
  };
  return JSON.stringify(ret);
};

var getIDCode = function(guid, cb) {
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      redisClient.incr('MSISDN_SEQ', function(err, replies) {
        var oContent = {
          idcode: replies,
          msisdn: ''
        };
        var sContent = JSON.stringify(oContent);
        redisClient.set(guid, sContent);
        cb(replies);
      });
    } else {
      var temp = JSON.parse(replies);
      cb(temp.idcode);
    }
  });
};

/**
 * genGUID 生成GUID
 * @param  {string} data   [客户端特征]
 * @param  {string} msisdn [手机号]
 * @return {string}        [guid]
 */
var genGUID = function(data, msisdn) {
  //TODO 如果是N4访问,需要用msisdn替代客户端特征
  var options = qs.parse(data);
  console.log(options);
  var guid_base_str = '';
  if (options.imei) {
    guid_base_str += options.imei;
  }
  if (options.mac) {
    guid_base_str += options.mac;
  }
  //如果取不到客户端唯一特征用时间戳替代
  if (guid_base_str == '') {
    guid_base_str = Date.now().toString();
  }
  console.log(guid_base_str);
  var guid = utils.md5(guid_base_str);
  guid = guid + utils.genCheckSum(guid);
  redisClient3.set(guid, JSON.stringify(options));
  var result = {
    error: null,
    guid: guid
  };
  return result;
};

app.post('/getGUID', function(req, res) {
  var body = '';
  req.on('data', function(chunk) {
    body += chunk;
  });
  req.on('end', function() {
    console.log(body);
    var result = genGUID(body);
    res.end(JSON.stringify(result));
    redisClient.get(result.guid, function(r) {
      if (null != r) {
        //do nothing
      } else {
        getIDCode(result.guid, function(idcode) {
          var obj = {
            idcode: idcode,
            msisdn: ''
          };
          redisClient.set(result.guid, JSON.stringify(obj));
          var obj4idcode = {
            guid: result.guid,
            msisdn: ''
          };
          redisClient2.set(idcode, JSON.stringify(obj4idcode));
        });
      }
    });
  });
});

/**
 * 根据GUID获取IDCODE(伪码)
 */
app.get('/getIDCodeByGUID', function(req, res) {
  var guid = req.query.guid;
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      var result = {
        error: 'GUID_NOT_EXIST',
        idcode: ''
      }
      res.end(JSON.stringify(result));
    } else {
      var temp = JSON.parse(replies);
      var result = {
        error: null,
        idcode: temp.idcode
      }
      res.end(JSON.stringify(result));
    }
  });
});
/**
 * 暂时不用/根据手机号获取伪码/for N4?
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
app.get('/getIDCodeByMSISDN', function(req, res) {
  console.log(req.url);
  var msisdn = req.query.msisdn;
  msisdn = msisdn.substr( - 11);
  var guid = genGUID4ByMSISDN(msisdn);
  console.log(guid);
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      getIDCode(guid, function(idcode) {
        res.end(idcode + '');
      });
    } else {
      res.end(replies);
    }
  });
});
/**
 * 根据伪码获取手机号
 */
app.get('/GetMSISDNByIDCode', function(req, res) {
  var idcode = req.query.idcode;
  if (idcode == undefined) {
    var result = {
      error: 'NOT_INPUT_IDCODE',
      msisdn: ''
    }
    res.end(JSON.stringify(result));
  } else {
    redisClient2.get(idcode, function(err, replies) {
      if (null === replies) {
        var result = {
          error: 'NOT_BIND_MSISDN',
          msisdn: ''
        }
        res.end(JSON.stringify(result));
      } else {
        var temp = JSON.parse(replies);
        var result = {
          error: null,
          msisdn: temp.msisdn
        }
        res.end(JSON.stringify(result));
      }
    });
  }
});

/**
 * 根据GUID获取手机号
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
app.get('/GetMSISDNByGUID', function(req, res) {
  var guid = req.query.guid;
  redisClient.get(guid, function(err, replies) {
    if (null === replies) {
      var result = {
        error: 'NOT_BIND_MSISDN',
        msisdn: ''
      }
      res.end(JSON.stringify(result));
    } else {
      var temp = JSON.parse(replies);
      var result = {
        error: null,
        msisdn: temp.msisdn
      }
      res.end(JSON.stringify(result));
    }
  });
});
/**
 * 短信上行绑定
 * @param  {[type]} req [description]
 * @param  {[type]} res [description]
 * @return {[type]}     [description]
 */
app.get('/MoBind', function(req, res) {
  var guid = req.query.guid;
  var msisdn = req.query.msisdn;
  if (guid == undefined || guid == '' || msisdn == '' || msisdn == undefined) {
    var result = {
      error: 'need guid or msisdn',
      msg: 'error'
    }
    res.end(JSON.stringify(result));
  } else {
    redisClient.get(guid, function(err, replies) {
      if (null === replies) {
        var result = {
          error: 'client not get guid from server',
          msg: 'error'
        }
        res.end(JSON.stringify(result));
      } else {
        var temp = JSON.parse(replies);
        //新绑定用户
        if (temp.msisdn == undefined || temp.msisdn == '') {
          var obj = {
            idcode: temp.idcode,
            msisdn: msisdn
          };
          redisClient.set(guid, JSON.stringify(obj));
          var obj4idcode = {
            guid: guid,
            msisdn: msisdn
          };
          selfStockProxyService.noticeProxyMSISDNBind(temp.idcode, msisdn, function(result) {
            console.log(result);
          });
          redisClient2.set(temp.idcode, JSON.stringify(obj4idcode));

        } else if (temp.msisdn != msisdn) { //重新绑定手机号
          //TODO 用户重新绑定，记录
          var obj = {
            idcode: temp.idcode,
            msisdn: msisdn
          };
          redisClient.set(guid, JSON.stringify(obj));
          var obj4idcode = {
            guid: guid,
            msisdn: msisdn
          };
          selfStockProxyService.noticeProxyMSISDNBind(temp.idcode, msisdn, function(result) {
            console.log(result);
          });
          redisClient2.set(temp.idcode, JSON.stringify(obj4idcode));

        } else {
          //do nothing
        }
        var result = {
          error: null,
          msg: 'ok'
        }
        res.end(JSON.stringify(result));
      }
    });
  }
});

app.get('/Test', function(req, res) {
  var guid = req.query.guid;
  res.end(utils.getGUIDFromXGUID(guid));
});
console.log(configs.service_port);
app.listen(configs.service_port);
console.log('Service Started ' + utils.getLocaleISOString());

