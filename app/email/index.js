var config = require('../../config');
var User = require('../models/user');
var fs = require('fs');
var helper = require('../helper');
var ensure = helper.ensure;
var extend = helper.extend;
var assert = require('assert');
var log = new helper.logg('Email');
var Mustache = require('mustache');
var Mailgun = require('mailgun-js');
var Remarkable = require('remarkable');
var md = new Remarkable();

var mailgun = new Mailgun({
  apiKey: config.mailgun.key,
  domain: config.mailgun.domain
});

var adminDir = __dirname + '/admin/';
var userDir = __dirname + '/user/';

var ADMIN = config.admin.email;
var FROM = config.mailgun.from;

// This module checks /user and /admin
// for each message + .txt in the list
// below. If it finds a file in /admin
// it will send it to me. If it finds
// a file in /user, it will send it
// to the user whose uid was passed.
var MESSAGES = [
  'ALREADY_CANCELLED',
  'BAD_REQUEST',
  'CANCELLED',
  'CLOSED',
  'DAILY_UPDATE',
  'DISABLED',
  'FAILED_PAYMENT',
  'LONG_DELAY',
  'NETWORK_ERROR',
  'NO_SPACE',
  'OVERDUE',
  'OVERDUE_CLOSURE',
  'RATE_LIMIT',
  'RESTART',
  'REVOKED',
  'SYNC_DOWN',
  'SYNC_EXCEPTION',
  'UPCOMING_RENEWAL',
  'UPDATE_BILLING'
];

var NO_MESSAGE = 'No messages found for';
var NO_ADDRESS = 'No email passed, or uid passed for';

var globals = {
  site: config.protocol + config.host
};

var EMAIL_MODEL = {
  to: 'string',
  from: 'string',
  subject: 'string',
  html: 'string',
};

function init (method) {

  ensure(method, 'string');

  var adminMessage = adminDir + method + '.txt';
  var userMessage = userDir + method + '.txt';

  var emailAdmin = fs.existsSync(adminMessage);
  var emailUser  = fs.existsSync(userMessage);

  return function build (uid, locals, callback) {

    uid = uid || '';
    locals = locals || {};
    callback = callback || function(){};

    if (!uid) return then();

    User.getBy({uid: uid}, function(err, user){

      if (err || !user)
        return log(err || 'No user with uid ' + uid);

      extend(locals)
        .and(globals)
        .and(user);

      then();
    });

    function then () {

      if (emailAdmin)
        send(locals, adminMessage, ADMIN, callback);

      if (emailUser && locals.email)
        send(locals, userMessage, locals.email, callback);

      if (emailUser && !locals.email)
        log(NO_ADDRESS, method);

      if (!emailAdmin && !emailUser)
        log(NO_MESSAGE, method);
    }
  };
}

function send (locals, messageFile, to, callback) {

  ensure(locals, 'object')
    .and(messageFile, 'string')
    .and(to, 'string')
    .and(callback, 'function');

  fs.readFile(messageFile, 'utf-8', function(err, text){

    if (err) throw err;

    var lines   = text.split('\n');
    var subject = Mustache.render(lines[0] || '', locals);
    var message = lines.slice(2).join('\n') || '';

    var html = md.render(Mustache.render(message, locals));

    var email = {
      html: html,
      subject: subject,
      from: locals.from || FROM,
      to: to
    };

    ensure(email, EMAIL_MODEL);

    if (config.environment === 'development') {
      console.log(email);
      console.log('Email not sent >>>>>>> In development mode');
      return callback();
    }

    mailgun.messages().send(email, function (err, body) {

      if (err) {
        console.log('Mailgun issue >>>>>');
        console.log(err);
        return log(err);
      }

      log('Sent to', email.to, '"' + email.subject + '"', '(' + body.id + ')');

      callback();
    });
  });
}

var exports = {};

for (var i in MESSAGES) {

  var method = MESSAGES[i];

  exports[method] = init(method);

  assert(fs.existsSync(adminDir + method + '.txt') ||
         fs.existsSync(userDir  + method + '.txt'), 'There is no message file for ' + method);
}

module.exports = exports;