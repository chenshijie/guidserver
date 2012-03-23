var http = require('http');

exports.noticeProxyMSISDNBind = function(idcode, msisdn, callback) {
  console.log(idcode);
  console.log(msisdn);
  var path = '/' + idcode + '/Stocks?action=sync&msisdn=' + msisdn;
  var options = {
    host: '172.16.33.238',
    port: 8082,
    path: path,
    method: 'GET'
  };
  var request = http.request(options, function(response) {
    response.setEncoding('binary');
    var body = '';
    response.on('data', function(chunk) {
      body += chunk;
    });
    response.on('end', function() {
      callback(body);
    });
  });
  request.end('', 'binary');
}

