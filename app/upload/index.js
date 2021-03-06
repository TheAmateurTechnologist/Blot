var config = require('../../config');
var helper = require('../helper');
var ensure = helper.ensure;
var type = helper.type;
var Hash = helper.hash;
var nameFrom = helper.nameFrom;
var joinpath = require('path').join;
var extend = helper.extend;
var zlib = require('zlib');
var extname = require('path').extname;

var blogBucket = config.s3.buckets.blogs;

// Don't pollute or overwrite production files
var root = config.environment === 'development' ? '/_dev/' : '/';
var BAD_PARAM = 'Please a path or url to upload';

var config = require('../../config');
var fs = require('fs');
var mime = require('mime');
var helper = require('../helper');
var ensure = helper.ensure;

var shouldGZIP = ['.css', '.js'];

var forGZIP = {ContentEncoding: 'gzip', Vary: 'Accept-Encoding'};
var MAX_EXPIRY = 'public, max-age=31536000';

var AWS = require('aws-sdk');

var CDN_BUCKET = config.cdn.bucket;
var CDN_HOST = config.cdn.host;

// Load in my credentials...
AWS.config.update({
  accessKeyId: config.s3.key,
  secretAccessKey: config.s3.secret
});

function upload (path, options, callback) {

  if (type(options,'function') && !callback) {
    callback = options;
    options = {};
  }

  ensure(path, 'string')
    .and(options, 'object')
    .and(callback, 'function');

  path = path.trim();

  if (!path) return callback(new Error(BAD_PARAM));

  var folder = '';
  var prefix = '';

  if (options.blogID) {
    prefix = Hash('blog:' + options.blogID).slice(0, 10);
  }

  if (options.folder) {
    folder = joinpath(options.folder, Date.now() + '');
  }

  var remote = '';

  if (options.remote) {
    remote = joinpath(root, prefix, options.remote);
  } else {
    remote = joinpath(root, prefix, folder, nameFrom(path));
  }

  // the key used at AWS should not have a leading slash...
  if (remote[0] === '/') {
    remote = remote.slice(1);
  }

  var body = fs.createReadStream(path);

  var params = {
    Bucket: options.bucket || blogBucket,
    Key: remote,
    CacheControl: MAX_EXPIRY,
    Expires: oneYearFromNow(),
    ContentType: mime.lookup(path)
  };

  // Cloudfront's automatic compression
  // is turned on but it didn't seem to work.
  // I tried setting content length and content type
  // but still I couldn't get the response I wanted
  // http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/S3.html#upload-property
  // so in the meantime I'll just do it myself
  if (canGZIP(path, options)) {
    var gzip;
    gzip = zlib.createGzip();
    body = body.pipe(gzip);
    extend(params).and(forGZIP);
    console.log('GZIPPING!');
  }

  // If I want to add a progress bar, you can listen to
  // s3Client.on('httpUploadProgress', function(){})
  var s3Client = new AWS.S3({params: params});

  s3Client.upload({Body: body}).send(function(err){

    if (err) return callback(err);

    callback(null, finalURL(params.Bucket, remote));
  });
}

function oneYearFromNow () {
  var expire = new Date();
      expire.setYear(expire.getFullYear() + 1);
      expire = Math.round(expire/1000);
  return expire;
}

function finalURL (bucket, path) {

  if (bucket === CDN_BUCKET)
    return '//' + CDN_HOST + '/' + path;

  return bucket + '/' + path;
}

function canGZIP (path) {
  return shouldGZIP.indexOf(extname(path).toLowerCase()) > -1;
}

module.exports = upload;